import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import {
  createMulti3Session,
  getMulti3Session,
  updateMulti3Session,
  patchMulti3Candidate,
  claimMulti3Execution,
  multi3DefaultModel,
  isMulti3SessionStale,
} from './session-store';
import { judgeMulti3Results } from './judge';
import {
  Multi3StartRequest,
  Multi3Session,
  Multi3Candidate,
  Multi3Command,
  Multi3TodosStage,
  DEFAULT_JUDGE_PROVIDER,
} from './types';
import { stageOverallProgress } from './progress';
import { AIProvider } from '@/lib/ai/types';
import { multi3CancelCheck, isCancelledError } from './cancel';
import { getMulti3FailureMessage } from './errors';
import { isValidTodosProviderSelection, sanitizeMulti3Models } from './models';
import { CANCELLATION_MARKER } from '@/lib/job-cancellation';
import {
  downloadChapterVersionFile,
  createChapterVersionFromFile,
  activateChapterVersion,
  syncMulti3ChapterVersionRoles,
  extractVersionTextPreview,
  getApiKey,
} from './chapter-helpers';
import { runTransformWithMode } from '@/lib/document-processing/run-transform';
import { buildDocumentContext } from '@/lib/document-processing/context';
import { translateDocx } from '@/lib/translation/docx-translator';
import { analyzeDocumentForAdaptation } from '@/lib/adapt/processor';
import { analyzeDocumentForAdjustments } from '@/lib/adjust/processor';
import { applySuggestionsToDocx, type ApplyDocxSuggestion } from '@/lib/translation/docx-translator';
import { extractDocumentStructure } from '@/lib/improvement/document-analyzer';
import { chatWithAgent } from '@/lib/ai/agent-chat';
import { supabase } from '@/lib/supabase';
import { BOOK_FINALIZE_INSTRUCTIONS, BOOK_IMPROVE_INSTRUCTIONS } from '@/lib/book-workflow/prompts';
import { runTodosCurrentnessReviewStep } from '@/lib/todos/currentness-review-step';

const STYLE_MAP: Record<string, 'academic' | 'professional' | 'simplified'> = {
  acadêmico: 'academic', academico: 'academic', academic: 'academic',
  profissional: 'professional', professional: 'professional',
  simplificado: 'simplified', simples: 'simplified', simplified: 'simplified',
};

const LANGUAGE_MAP: Record<string, string> = {
  português: 'pt', portugues: 'pt', pt: 'pt',
  inglês: 'en', ingles: 'en', english: 'en', en: 'en',
  espanhol: 'es', spanish: 'es', es: 'es',
};

function multi3Meta(sessionId: string, provider: AIProvider, branchIndex: number, command: Multi3Command) {
  return {
    multi3SessionId: sessionId,
    multi3Provider: provider,
    multi3Role: 'candidate',
    multi3Command: command,
    multi3BranchIndex: branchIndex,
  };
}

type TodosStage = Exclude<Multi3TodosStage, 'starting' | 'completed'>;
type CandidateStepProgress = (
  stageProgress: number,
  label: string,
  currentBatch?: number,
  totalBatches?: number
) => void | Promise<void>;

export async function startChapterMulti3(
  chapterId: string,
  req: Multi3StartRequest
): Promise<Multi3Session> {
  if (req.command !== '/todos' || !isValidTodosProviderSelection(req.providers)) {
    throw new Error('O comando /todos exige exatamente 3 provedores diferentes.');
  }
  const judgeProvider = req.judgeProvider || DEFAULT_JUDGE_PROVIDER;
  const modelProviders = Array.from(new Set([...req.providers, judgeProvider]));
  const models = sanitizeMulti3Models(modelProviders, req.models || {});

  const session = await createMulti3Session('chapter', chapterId, { ...req, models });
  return session;
}

/** Executa pipeline Multi-IA (3 candidatos → juiz → aceitar vencedor). */
export async function executeChapterMulti3Session(
  chapterId: string,
  sessionId: string
): Promise<Multi3Session> {
  const session = await getMulti3Session(sessionId);
  if (!session) throw new Error('Sessão não encontrada');

  if (['accepted', 'failed', 'awaiting_human'].includes(session.status)) {
    return session;
  }

  const claimed = await claimMulti3Execution(sessionId);
  if (!claimed) {
    const current = await getMulti3Session(sessionId);
    if (!current) throw new Error('Sessão não encontrada');

    if (isMulti3SessionStale(current)) {
      console.warn(`[MULTI3 ${sessionId}] Sessão travada — tentando retomar execução`);
      await updateMulti3Session(sessionId, { status: 'running' });
      const reclaimed = await claimMulti3Execution(sessionId);
      if (!reclaimed) {
        throw new Error('Não foi possível retomar o processamento Multi-IA travado');
      }
    } else if (['processing', 'candidates_ready', 'judging'].includes(current.status)) {
      return current;
    } else {
      throw new Error('Não foi possível iniciar o processamento Multi-IA');
    }
  }

  const req: Multi3StartRequest & { models: Partial<Record<AIProvider, string>> } = {
    providers: session.providers,
    judgeProvider: session.judgeProvider,
    command: session.command,
    args: session.commandArgs,
    versionId: session.parentVersionId || '',
    models: {
      ...Object.fromEntries(
      session.candidates.map((c) => [c.provider, c.model])
      ),
      [session.judgeProvider]: session.judgeModel || multi3DefaultModel(session.judgeProvider),
    } as Partial<Record<AIProvider, string>>,
  };

  if (!req.versionId) {
    await updateMulti3Session(sessionId, { status: 'failed', completedAt: new Date().toISOString() });
    throw new Error('Versão base não definida na sessão');
  }

  try {
    await runChapterMulti3Pipeline(chapterId, sessionId, req);
  } catch (err) {
    console.error(`[MULTI3 ${sessionId}] Pipeline error:`, err);
    if (isCancelledError(err)) {
      await updateMulti3Session(sessionId, {
        status: 'failed',
        completedAt: new Date().toISOString(),
        judgeReasoning: `${CANCELLATION_MARKER} Cancelado pelo usuário.`,
      });
    } else {
      await updateMulti3Session(sessionId, { status: 'failed', completedAt: new Date().toISOString() });
    }
    throw err;
  }

  const updated = await getMulti3Session(sessionId);
  return updated!;
}

async function runChapterMulti3Pipeline(
  chapterId: string,
  sessionId: string,
  req: Multi3StartRequest & { models: Partial<Record<AIProvider, string>> }
): Promise<void> {
  const cancelCheck = multi3CancelCheck(sessionId);

  const candidates = await Promise.all(
    req.providers.map(async (provider, branchIndex) => {
      cancelCheck();
      await patchMulti3Candidate(sessionId, branchIndex, {
        provider,
        model: req.models?.[provider] || multi3DefaultModel(provider),
        status: 'running',
        branchIndex,
        progress: 5,
        progressLabel: 'Iniciando...',
        stage: 'starting',
        stageProgress: 0,
      });

      const heartbeat = setInterval(() => {
        void patchMulti3Candidate(sessionId, branchIndex, {
          provider,
          model: req.models?.[provider] || multi3DefaultModel(provider),
          status: 'running',
          branchIndex,
        }).catch((error) => console.warn(`[MULTI3 ${sessionId}] heartbeat`, error));
      }, 30_000);

      try {
        const result = await runSingleCandidate(chapterId, sessionId, req, provider, branchIndex);
        console.log(`[MULTI3 ${sessionId}] Candidato ${provider}/${req.models?.[provider] || multi3DefaultModel(provider)} → ${result.status}`);
        await patchMulti3Candidate(sessionId, branchIndex, result);
        return result;
      } finally {
        clearInterval(heartbeat);
      }
    })
  );

  cancelCheck();
  const persistedCandidates = (await getMulti3Session(sessionId))?.candidates || candidates;
  await updateMulti3Session(sessionId, { candidates: persistedCandidates, status: 'candidates_ready' });

  const completed = persistedCandidates.filter((c) => c.status === 'completed');
  if (completed.length === 0) {
    await updateMulti3Session(sessionId, {
      status: 'failed',
      completedAt: new Date().toISOString(),
      judgeReasoning: getMulti3FailureMessage({ candidates: persistedCandidates, status: 'failed' }),
    });
    return;
  }

  cancelCheck();
  await updateMulti3Session(sessionId, { status: 'judging' });

  const judgeProvider = req.judgeProvider || DEFAULT_JUDGE_PROVIDER;
  const judgeModel = req.models?.[judgeProvider] || multi3DefaultModel(judgeProvider);

  const textByProvider: Record<string, string> = {};
  for (const c of completed) {
    if (c.text) {
      textByProvider[c.provider] = c.text;
    } else if (c.versionId) {
      const { data: ver } = await supabase
        .from('chapter_versions')
        .select('file_path')
        .eq('id', c.versionId)
        .single();
      if (ver?.file_path) {
        const tmp = await downloadChapterVersionFile(c.versionId, ver.file_path, 'judge_preview');
        try {
          textByProvider[c.provider] = await extractVersionTextPreview(tmp);
        } finally {
          await fs.unlink(tmp).catch(() => {});
        }
      }
    }
  }

  const judgeResult = await judgeMulti3Results({
    command: req.command,
    commandArgs: req.args || '',
    judgeProvider,
    judgeModel,
    candidates: completed.map((c) => ({
      provider: c.provider,
      text: textByProvider[c.provider] || c.text || '',
    })),
  });

  const winner = completed.find((c) => c.provider === judgeResult.winnerProvider) || completed[0];

  await updateMulti3Session(sessionId, {
    winnerProvider: winner.provider,
    winnerVersionId: winner.versionId,
    judgeReasoning: judgeResult.reasoning,
    judgeScores: judgeResult.scores,
    completedAt: new Date().toISOString(),
  });

  await acceptMulti3Winner(sessionId, winner.provider);
}

async function runSingleCandidate(
  chapterId: string,
  sessionId: string,
  req: Multi3StartRequest & { models: Partial<Record<AIProvider, string>> },
  provider: AIProvider,
  branchIndex: number
): Promise<Multi3Candidate> {
  const model = req.models?.[provider] || multi3DefaultModel(provider);
  const meta = multi3Meta(sessionId, provider, branchIndex, req.command);

  try {
    switch (req.command) {
      case '/todos':
        return await runTodosCandidate(chapterId, req.versionId, provider, model, meta, branchIndex, sessionId);
      case '/perguntar':
        return await runPerguntarCandidate(chapterId, req.versionId, provider, model, req.args || '', branchIndex, sessionId);
      case '/ajustar':
        return await runAdjustCandidate(chapterId, req.versionId, provider, model, req.args || '', meta, sessionId);
      case '/adaptar':
        return await runAdaptCandidate(chapterId, req.versionId, provider, model, req.args || '', meta, sessionId);
      case '/traduzir':
        return await runTranslateCandidate(chapterId, req.versionId, provider, model, req.args || '', meta, sessionId);
      case '/revisar':
        return await runRevisarCandidate(chapterId, req.versionId, provider, model, meta, sessionId);
      default:
        throw new Error(`Comando não suportado: ${req.command}`);
    }
  } catch (error: any) {
    if (isCancelledError(error)) {
      return {
        provider,
        model,
        status: 'failed',
        branchIndex,
        error: `${CANCELLATION_MARKER} Cancelado pelo usuário.`,
      };
    }
    return {
      provider,
      model,
      status: 'failed',
      branchIndex,
      error: error.message,
    };
  }
}

async function runTodosCandidate(
  chapterId: string,
  versionId: string,
  provider: AIProvider,
  model: string,
  meta: Record<string, unknown>,
  branchIndex: number,
  sessionId: string
): Promise<Multi3Candidate> {
  const versionIds: string[] = [];
  const stepMeta = (step: string) => ({
    ...meta,
    autoAppliedBy: '/todos',
    multi3Step: step,
  });
  const markStep = async (
    stage: TodosStage,
    stageProgress: number,
    progressLabel: string,
    currentBatch?: number,
    totalBatches?: number
  ) => {
    await patchMulti3Candidate(sessionId, branchIndex, {
      provider,
      model,
      status: 'running',
      branchIndex,
      progress: stageOverallProgress(stage, stageProgress),
      progressLabel,
      stage,
      stageProgress,
      currentBatch,
      totalBatches,
    });
  };

  await markStep('translate', 0, 'Preparando tradução para português');
  const translated = await runTranslateCandidate(
    chapterId,
    versionId,
    provider,
    model,
    'pt',
    stepMeta('translate'),
    sessionId,
    (progress, label, current, total) => markStep('translate', progress, label, current, total)
  );
  if (!translated.versionId) throw new Error('/todos: tradução não gerou versão');
  versionIds.push(translated.versionId);
  await markStep('translate', 100, 'Tradução concluída');

  await markStep('review', 0, 'Preparando revisão de vigência, fatos e dados');
  const reviewed = await runRevisarCandidate(
    chapterId,
    translated.versionId,
    provider,
    model,
    stepMeta('review'),
    sessionId,
    (progress, label, current, total) => markStep('review', progress, label, current, total)
  );
  if (!reviewed.versionId) throw new Error('/todos: revisão não gerou versão');
  versionIds.push(reviewed.versionId);
  await markStep('review', 100, 'Revisão concluída');

  await markStep('improve', 0, 'Preparando aprimoramento de conteúdo e fontes');
  const improved = await runAdjustCandidate(
    chapterId,
    reviewed.versionId,
    provider,
    model,
    BOOK_IMPROVE_INSTRUCTIONS,
    stepMeta('improve'),
    sessionId,
    'improve',
    (progress, label, current, total) => markStep('improve', progress, label, current, total)
  );
  if (!improved.versionId) throw new Error('/todos: aprimoramento não gerou versão');
  versionIds.push(improved.versionId);
  await markStep('improve', 100, 'Aprimoramento concluído');

  await markStep('finalize', 0, 'Preparando finalização editorial');
  const finalized = await runAdjustCandidate(
    chapterId,
    improved.versionId,
    provider,
    model,
    BOOK_FINALIZE_INSTRUCTIONS,
    stepMeta('finalize'),
    sessionId,
    'adjust',
    (progress, label, current, total) => markStep('finalize', progress, label, current, total)
  );
  if (!finalized.versionId) throw new Error('/todos: finalização não gerou versão');
  versionIds.push(finalized.versionId);

  return {
    provider,
    model,
    status: 'completed',
    versionId: finalized.versionId,
    versionIds,
    branchIndex,
    text: finalized.text,
    progress: 100,
    progressLabel: '/todos concluído: traduzir → revisar → aprimorar → finalizar',
    stage: 'completed',
    stageProgress: 100,
  };
}

async function runPerguntarCandidate(
  chapterId: string,
  versionId: string,
  provider: AIProvider,
  model: string,
  question: string,
  branchIndex: number,
  sessionId: string
): Promise<Multi3Candidate> {
  multi3CancelCheck(sessionId)();
  const { data: ver } = await supabase
    .from('chapter_versions')
    .select('file_path')
    .eq('id', versionId)
    .single();
  if (!ver) throw new Error('Versão não encontrada');

  const tmp = await downloadChapterVersionFile(versionId, ver.file_path, 'perguntar');
  let docText = '';
  try {
    const { paragraphs } = await extractDocumentStructure(tmp);
    docText = paragraphs.map((p) => p.text).join('\n\n');
  } finally {
    await fs.unlink(tmp).catch(() => {});
  }

  const ctx = await buildDocumentContext({
    documentText: docText,
    versionId,
    query: question,
  });

  const reply = await chatWithAgent({
    provider,
    model,
    systemPrompt: `Você responde perguntas sobre o documento "${chapterId}". Responda em português de forma clara e objetiva. Modo de contexto: ${ctx.modeUsed}.`,
    history: [],
    userMessage: `Documento:\n${ctx.text}\n\nPergunta: ${question}`,
  });

  return {
    provider,
    model,
    status: 'completed',
    branchIndex,
    text: reply,
    progress: 100,
  };
}

async function runAdjustCandidate(
  chapterId: string,
  versionId: string,
  provider: AIProvider,
  model: string,
  instructions: string,
  meta: Record<string, unknown>,
  sessionId: string,
  operation: 'adjust' | 'improve' = 'adjust',
  onProgress?: CandidateStepProgress
): Promise<Multi3Candidate> {
  const cancelCheck = multi3CancelCheck(sessionId);
  const { data: ver } = await supabase.from('chapter_versions').select('file_path').eq('id', versionId).single();
  if (!ver) throw new Error('Versão não encontrada');

  const inputPath = await downloadChapterVersionFile(versionId, ver.file_path, 'adjust');
  const outputPath = path.join(os.tmpdir(), `${randomUUID()}_adjust.docx`);

  try {
    const transform = await runTransformWithMode(inputPath, outputPath, {
      task: 'adjust',
      provider,
      model,
      adjustInstructions: instructions,
    });

    if (transform.runBatches) {
      await onProgress?.(8, 'Preparando os lotes editoriais');
      const suggestions = await analyzeDocumentForAdjustments(
        inputPath,
        instructions,
        5,
        provider,
        model,
        getApiKey(provider),
        false,
        cancelCheck,
        meta.autoAppliedBy === '/todos' ? 'todos' : 'direct',
        async (currentBatch, totalBatches) => {
          const progress = 8 + Math.round((currentBatch / Math.max(1, totalBatches)) * 87);
          await onProgress?.(
            progress,
            `Processando lote editorial ${currentBatch}/${totalBatches}`,
            currentBatch,
            totalBatches
          );
        }
      );
      const docxSuggestions: ApplyDocxSuggestion[] = suggestions.map((s: any) => ({
        id: s.id,
        originalText: s.originalText || '',
        improvedText: s.adjustedText || s.improvedText || '',
      }));
      await applySuggestionsToDocx(inputPath, outputPath, docxSuggestions);
      await onProgress?.(98, 'Aplicando as alterações ao documento');
    }

    const newVersionId = await createChapterVersionFromFile(
      chapterId,
      versionId,
      outputPath,
      operation,
      { ...meta, instructions, processingMode: transform.processingMode },
      false
    );

    const preview = await extractVersionTextPreview(outputPath);
    return {
      provider,
      model,
      status: 'completed',
      versionId: newVersionId,
      text: preview,
      progress: 100,
    };
  } finally {
    await fs.unlink(inputPath).catch(() => {});
    await fs.unlink(outputPath).catch(() => {});
  }
}

async function runAdaptCandidate(
  chapterId: string,
  versionId: string,
  provider: AIProvider,
  model: string,
  styleArg: string,
  meta: Record<string, unknown>,
  sessionId: string
): Promise<Multi3Candidate> {
  const cancelCheck = multi3CancelCheck(sessionId);
  const branchIndex = meta.multi3BranchIndex as number;
  const styleKey = styleArg.toLowerCase().split(/\s+/)[0].normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const style = STYLE_MAP[styleKey] || STYLE_MAP[styleArg.toLowerCase().split(/\s+/)[0]] || 'simplified';

  console.log(`[MULTI3 ${sessionId}] /adaptar ${provider}/${model} estilo=${style} (${styleArg})`);

  const { data: ver } = await supabase.from('chapter_versions').select('file_path').eq('id', versionId).single();
  if (!ver) throw new Error('Versão não encontrada');

  const inputPath = await downloadChapterVersionFile(versionId, ver.file_path, 'adapt');
  const outputPath = path.join(os.tmpdir(), `${randomUUID()}_adapt.docx`);

  await patchMulti3Candidate(sessionId, branchIndex, {
    provider,
    model,
    status: 'running',
    branchIndex,
    progress: 8,
    progressLabel: `${provider} adaptando (${styleArg || style})`,
  });

  try {
    const transform = await runTransformWithMode(inputPath, outputPath, {
      task: 'adapt',
      provider,
      model,
      adaptStyle: style,
    });

    if (transform.runBatches) {
      const suggestions = await analyzeDocumentForAdaptation(
        inputPath,
        style,
        undefined,
        provider,
        model,
        getApiKey(provider),
        async (_section, totalSections, batch, totalBatches) => {
          const pct = Math.min(85, Math.round(((batch || 1) / (totalBatches || 1)) * 70 + 10));
          await patchMulti3Candidate(sessionId, branchIndex, {
            provider,
            model,
            status: 'running',
            branchIndex,
            progress: pct,
            progressLabel: `Adaptando lote ${batch}/${totalBatches}`,
          });
        },
        undefined,
        cancelCheck
      );
      const docxSuggestions: ApplyDocxSuggestion[] = suggestions.map((s: any) => ({
        id: s.id,
        originalText: s.originalText || '',
        improvedText: s.adaptedText || '',
      }));
      if (docxSuggestions.length === 0) {
        throw new Error(transform.wholeError || 'Adaptação não gerou alterações — verifique créditos e chaves de API.');
      }
      await applySuggestionsToDocx(inputPath, outputPath, docxSuggestions);
    }

    const newVersionId = await createChapterVersionFromFile(
      chapterId,
      versionId,
      outputPath,
      'adapt',
      { ...meta, style, processingMode: transform.processingMode },
      false
    );

    const preview = await extractVersionTextPreview(outputPath);
    return {
      provider,
      model,
      status: 'completed',
      versionId: newVersionId,
      text: preview,
      progress: 100,
    };
  } finally {
    await fs.unlink(inputPath).catch(() => {});
    await fs.unlink(outputPath).catch(() => {});
  }
}

async function runTranslateCandidate(
  chapterId: string,
  versionId: string,
  provider: AIProvider,
  model: string,
  langArg: string,
  meta: Record<string, unknown>,
  sessionId: string,
  onProgress?: CandidateStepProgress
): Promise<Multi3Candidate> {
  multi3CancelCheck(sessionId)();
  const lang = LANGUAGE_MAP[langArg.toLowerCase().split(/\s+/)[0]] || 'pt';
  const { data: ver } = await supabase.from('chapter_versions').select('file_path').eq('id', versionId).single();
  if (!ver) throw new Error('Versão não encontrada');

  const inputPath = await downloadChapterVersionFile(versionId, ver.file_path, 'translate');
  const outputPath = path.join(os.tmpdir(), `${randomUUID()}_translate.docx`);

  try {
    const transform = await runTransformWithMode(inputPath, outputPath, {
      task: 'translate',
      provider,
      model,
      targetLanguage: lang as any,
    });

    if (transform.runBatches) {
      const result = await translateDocx(inputPath, outputPath, {
        targetLanguage: lang as any,
        provider,
        model,
        onProgress: (translationProgress) => {
          void onProgress?.(
            translationProgress.percentage,
            `Traduzindo lote ${translationProgress.currentChunk}/${translationProgress.totalChunks}`,
            translationProgress.currentChunk,
            translationProgress.totalChunks
          );
        },
      });
      if (!result.success) throw new Error(result.error || 'Falha na tradução');
    }

    const newVersionId = await createChapterVersionFromFile(
      chapterId,
      versionId,
      outputPath,
      'translate',
      { ...meta, targetLanguage: lang, processingMode: transform.processingMode },
      false
    );

    const preview = await extractVersionTextPreview(outputPath);
    return {
      provider,
      model,
      status: 'completed',
      versionId: newVersionId,
      text: preview,
      progress: 100,
    };
  } finally {
    await fs.unlink(inputPath).catch(() => {});
    await fs.unlink(outputPath).catch(() => {});
  }
}

async function runRevisarCandidate(
  chapterId: string,
  versionId: string,
  provider: AIProvider,
  model: string,
  meta: Record<string, unknown>,
  sessionId: string,
  onProgress?: CandidateStepProgress
): Promise<Multi3Candidate> {
  const cancelCheck = multi3CancelCheck(sessionId);
  cancelCheck();
  const { data: ver } = await supabase.from('chapter_versions').select('file_path').eq('id', versionId).single();
  if (!ver) throw new Error('Versão não encontrada');

  const inputPath = await downloadChapterVersionFile(versionId, ver.file_path, 'revisar');
  const outputPath = path.join(os.tmpdir(), `${randomUUID()}_revisar.docx`);

  try {
    const reviewResult = await runTodosCurrentnessReviewStep({
      inputPath,
      outputPath,
      provider,
      model,
      apiKey: getApiKey(provider),
      onLog: (message) => {
        console.log(`[MULTI3 ${sessionId}] /todos revisar ${provider}/${model}: ${message}`);
      },
      onProgress: async (progress) => {
        cancelCheck();
        await onProgress?.(
          progress.percentage,
          progress.label,
          progress.current,
          progress.total
        );
      },
    });

    const newVersionId = await createChapterVersionFromFile(
      chapterId,
      versionId,
      outputPath,
      'update',
      {
        ...meta,
        multi3AutoApplied: true,
        reviewScope: 'currentness',
        researchDepth: 'deep',
        currentnessFindings: reviewResult.findings.length,
        currentnessApplied: reviewResult.applyResult?.appliedCount ?? 0,
      },
      false
    );

    const preview = await extractVersionTextPreview(outputPath);
    return {
      provider,
      model,
      status: 'completed',
      versionId: newVersionId,
      text: preview,
      progress: 100,
    };
  } finally {
    await fs.unlink(inputPath).catch(() => {});
    await fs.unlink(outputPath).catch(() => {});
  }
}

export async function acceptMulti3Winner(
  sessionId: string,
  provider?: AIProvider
): Promise<Multi3Session> {
  const session = await getMulti3Session(sessionId);
  if (!session) throw new Error('Sessão não encontrada');

  const chosenProvider = provider || session.winnerProvider;
  if (!chosenProvider) throw new Error('Nenhum vencedor definido');

  const winner = session.candidates.find((c) => c.provider === chosenProvider && c.status === 'completed');
  if (!winner) throw new Error('Candidato não encontrado');

  if (session.command === '/perguntar' || !winner.versionId) {
    await updateMulti3Session(sessionId, {
      status: 'accepted',
      winnerProvider: chosenProvider,
      completedAt: new Date().toISOString(),
    });
    const updated = await getMulti3Session(sessionId);
    return updated!;
  }

  if (session.targetType === 'chapter' && winner.versionId) {
    await activateChapterVersion(session.targetId, winner.versionId);
    await syncMulti3ChapterVersionRoles(session.targetId, sessionId, winner.versionId);
  }

  await updateMulti3Session(sessionId, {
    status: 'accepted',
    winnerProvider: chosenProvider,
    winnerVersionId: winner.versionId,
    completedAt: new Date().toISOString(),
  });

  const updated = await getMulti3Session(sessionId);
  return updated!;
}

export async function rejudgeMulti3Session(
  sessionId: string,
  judgeProvider: AIProvider,
  judgeModel?: string
): Promise<Multi3Session> {
  const session = await getMulti3Session(sessionId);
  if (!session) throw new Error('Sessão não encontrada');

  const completed = session.candidates.filter((c) => c.status === 'completed');
  const textByProvider: Record<string, string> = {};

  for (const c of completed) {
    if (c.text) {
      textByProvider[c.provider] = c.text;
    } else if (c.versionId) {
      const { data: ver } = await supabase
        .from('chapter_versions')
        .select('file_path')
        .eq('id', c.versionId)
        .single();
      if (ver?.file_path) {
        const tmp = await downloadChapterVersionFile(c.versionId, ver.file_path, 'rejudge');
        try {
          textByProvider[c.provider] = await extractVersionTextPreview(tmp);
        } finally {
          await fs.unlink(tmp).catch(() => {});
        }
      }
    }
  }

  const model = judgeModel || multi3DefaultModel(judgeProvider);
  const judgeResult = await judgeMulti3Results({
    command: session.command,
    commandArgs: session.commandArgs,
    judgeProvider,
    judgeModel: model,
    candidates: completed.map((c) => ({
      provider: c.provider,
      text: textByProvider[c.provider] || c.text || '',
    })),
  });

  const winner = completed.find((c) => c.provider === judgeResult.winnerProvider) || completed[0];

  await updateMulti3Session(sessionId, {
    judgeProvider,
    candidates: session.candidates.map((candidate) => ({ ...candidate, judgeModel: model })),
    winnerProvider: winner.provider,
    winnerVersionId: winner.versionId,
    judgeReasoning: judgeResult.reasoning,
    judgeScores: judgeResult.scores,
  });

  if (session.command !== '/perguntar' && winner.versionId) {
    if (session.targetType === 'document') {
      const { acceptDocumentMulti3Winner } = await import('./document-orchestrator');
      await acceptDocumentMulti3Winner(sessionId, winner.provider);
    } else {
      await acceptMulti3Winner(sessionId, winner.provider);
    }
  } else {
    await updateMulti3Session(sessionId, {
      status: 'accepted',
      winnerProvider: winner.provider,
      completedAt: new Date().toISOString(),
    });
  }

  const updated = await getMulti3Session(sessionId);
  return updated!;
}
