/**
 * Document-level Multi-IA orchestrator (projects agent).
 * Stores candidate outputs in storage; the final editor synthesizes and activates a fourth version.
 */

import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { supabase } from '@/lib/supabase';
import { persistDocumentVersion, archiveDocumentCandidate } from '@/lib/document-versioning';
import {
  createMulti3Session,
  getMulti3Session,
  updateMulti3Session,
  patchMulti3Candidate,
  claimMulti3Execution,
  multi3DefaultModel,
  isMulti3SessionStale,
} from './session-store';
import {
  replaceJudgeFinalCandidate,
  sourceMulti3Candidates,
  synthesizeJudgeFinalDocument,
} from './judge-editor';
import { Multi3StartRequest, Multi3Session, Multi3Candidate, DEFAULT_JUDGE_PROVIDER } from './types';
import { AIProvider } from '@/lib/ai/types';
import { chatWithAgent } from '@/lib/ai/agent-chat';
import { buildDocumentContext } from '@/lib/document-processing/context';
import { runTransformWithMode } from '@/lib/document-processing/run-transform';
import { extractDocumentStructure } from '@/lib/improvement/document-analyzer';
import { runTodosPipeline as runDocumentTodosPipeline } from '@/lib/todos/run-document-todos-pipeline';
import { multi3CancelCheck, isCancelledError } from './cancel';
import { getMulti3FailureMessage } from './errors';
import { isValidTodosProviderSelection, sanitizeMulti3Models } from './models';
import { CANCELLATION_MARKER } from '@/lib/job-cancellation';
import { getApiKey } from './chapter-helpers';

async function downloadDocumentFile(documentId: string, filePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from('documents').download(filePath);
  if (error || !data) throw new Error(`Download failed: ${error?.message}`);
  const tmp = path.join(os.tmpdir(), `${documentId}_${randomUUID()}.docx`);
  await fs.writeFile(tmp, Buffer.from(await data.arrayBuffer()));
  return tmp;
}

export async function startDocumentMulti3(
  documentId: string,
  req: Multi3StartRequest
): Promise<Multi3Session> {
  if (req.command !== '/todos' || !isValidTodosProviderSelection(req.providers)) {
    throw new Error('O comando /todos exige exatamente 3 provedores diferentes.');
  }
  const judgeProvider = req.judgeProvider || DEFAULT_JUDGE_PROVIDER;
  const modelProviders = Array.from(new Set([...req.providers, judgeProvider]));
  const models = sanitizeMulti3Models(modelProviders, req.models || {});

  const session = await createMulti3Session('document', documentId, { ...req, models });
  return session;
}

export async function executeDocumentMulti3Session(
  documentId: string,
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
      await updateMulti3Session(sessionId, { status: 'running' });
      const reclaimed = await claimMulti3Execution(sessionId);
      if (!reclaimed) throw new Error('Não foi possível retomar o processamento Multi-IA travado');
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
    versionId: session.parentVersionId || documentId,
    models: {
      ...Object.fromEntries(
      session.candidates.map((c) => [c.provider, c.model])
      ),
      [session.judgeProvider]: session.judgeModel || multi3DefaultModel(session.judgeProvider),
    } as Partial<Record<AIProvider, string>>,
  };

  try {
    await runDocumentMulti3Pipeline(documentId, sessionId, req);
  } catch (err) {
    console.error(`[DOC-MULTI3 ${sessionId}]`, err);
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

async function runDocumentMulti3Pipeline(
  documentId: string,
  sessionId: string,
  req: Multi3StartRequest & { models: Partial<Record<AIProvider, string>> }
): Promise<void> {
  const { data: doc } = await supabase.from('documents').select('*').eq('id', documentId).single();
  if (!doc) throw new Error('Document not found');

  const candidates = await Promise.all(
    req.providers.map(async (provider, branchIndex) => {
      multi3CancelCheck(sessionId)();
      const model = req.models?.[provider] || multi3DefaultModel(provider);
      await patchMulti3Candidate(sessionId, branchIndex, {
        provider,
        model,
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
          model,
          status: 'running',
          branchIndex,
        }).catch((error) => console.warn(`[DOC-MULTI3 ${sessionId}] heartbeat`, error));
      }, 30_000);

      const done = async (candidate: Multi3Candidate) => {
        await patchMulti3Candidate(sessionId, branchIndex, candidate);
        return candidate;
      };

      try {
        if (req.command === '/perguntar') {
          const tmp = await downloadDocumentFile(documentId, doc.file_path);
          let docText = '';
          try {
            const { paragraphs } = await extractDocumentStructure(tmp);
            docText = paragraphs.map((p) => p.text).join('\n\n');
          } finally {
            await fs.unlink(tmp).catch(() => {});
          }
          const ctx = await buildDocumentContext({
            documentText: docText,
            documentId,
            query: req.args || '',
          });
          const text = await chatWithAgent({
            provider,
            model,
            systemPrompt: `Responda perguntas sobre o documento em português. Modo de contexto: ${ctx.modeUsed}.`,
            history: [],
            userMessage: `Documento:\n${ctx.text}\n\nPergunta: ${req.args}`,
          });
          return done({ provider, model, status: 'completed' as const, text, branchIndex, progress: 100 });
        }

        if (req.command === '/todos') {
          const todosResult = await runDocumentTodosPipeline(documentId, doc, {
            provider,
            model,
            targetLanguage: 'pt',
            deferPersist: true,
            onProgress: async (progress) => {
              await patchMulti3Candidate(sessionId, branchIndex, {
                provider,
                model,
                status: 'running',
                branchIndex,
                progress: progress.progress,
                progressLabel: progress.label,
                stage: progress.stage,
                stageProgress: progress.stageProgress,
                currentBatch: progress.currentBatch,
                totalBatches: progress.totalBatches,
              });
            },
          });
          if (todosResult.finalPath) {
            try {
              const buffer = await fs.readFile(todosResult.finalPath);
              const archivedPath = await archiveDocumentCandidate(
                documentId,
                buffer,
                `multi3_todos_${provider}`
              );
              return done({
                provider,
                model,
                status: 'completed' as const,
                text: todosResult.previewText,
                branchIndex,
                progress: 100,
                versionIds: todosResult.stepPaths,
                versionId: archivedPath,
                progressLabel: '/todos concluído: traduzir → revisar → aprimorar → finalizar',
                stage: 'completed',
                stageProgress: 100,
              });
            } finally {
              await fs.unlink(todosResult.finalPath).catch(() => {});
            }
          }
          return done({
            provider,
            model,
            status: 'failed' as const,
            branchIndex,
            error: 'Pipeline /todos não gerou arquivo final',
          });
        }

        const inputPath = await downloadDocumentFile(documentId, doc.file_path);
        const outputPath = path.join(os.tmpdir(), `${randomUUID()}_doc_multi3.docx`);
        try {
          const task = req.command === '/adaptar' ? 'adapt' as const
            : req.command === '/traduzir' ? 'translate' as const
            : 'adjust' as const;

          const transform = await runTransformWithMode(inputPath, outputPath, {
            task,
            provider,
            model,
            adaptStyle: 'simplified',
            adjustInstructions: req.args,
            targetLanguage: 'pt',
          });

          if (transform.runBatches) {
            await fs.copyFile(inputPath, outputPath);
          } else if (!transform.usedWhole) {
            throw new Error(transform.wholeError || 'Falha no processamento');
          }

          const buffer = await fs.readFile(outputPath);
          const archivedPath = await archiveDocumentCandidate(
            documentId,
            buffer,
            `multi3_${req.command.replace('/', '')}_${provider}`
          );

          const { paragraphs } = await extractDocumentStructure(outputPath);
          const preview = paragraphs.map((p) => p.text).join('\n\n').slice(0, 8000);

          return done({
            provider,
            model,
            status: 'completed' as const,
            text: preview,
            branchIndex,
            progress: 100,
            versionId: archivedPath,
          });
        } finally {
          await fs.unlink(inputPath).catch(() => {});
          await fs.unlink(outputPath).catch(() => {});
        }
      } catch (error: any) {
        if (isCancelledError(error)) {
          return done({
            provider,
            model,
            status: 'failed' as const,
            branchIndex,
            error: `${CANCELLATION_MARKER} Cancelado pelo usuário.`,
          });
        }
        return done({ provider, model, status: 'failed' as const, branchIndex, error: error.message });
      } finally {
        clearInterval(heartbeat);
      }
    })
  );

  const persistedCandidates = (await getMulti3Session(sessionId))?.candidates || candidates;
  await updateMulti3Session(sessionId, { candidates: persistedCandidates, status: 'candidates_ready' });

  const completed = sourceMulti3Candidates(persistedCandidates).filter((c) => c.status === 'completed');
  if (completed.length === 0) {
    await updateMulti3Session(sessionId, {
      status: 'failed',
      completedAt: new Date().toISOString(),
      judgeReasoning: getMulti3FailureMessage({ candidates: persistedCandidates, status: 'failed' }),
    });
    return;
  }

  await updateMulti3Session(sessionId, { status: 'judging' });
  const judgeProvider = req.judgeProvider || 'gemini';
  const judgeModel = req.models?.[judgeProvider] || multi3DefaultModel(judgeProvider);

  const finalCandidate = await createDocumentJudgeFinal(
    documentId,
    sessionId,
    completed,
    judgeProvider,
    judgeModel,
    req.args || ''
  );

  await updateMulti3Session(sessionId, {
    winnerProvider: finalCandidate.provider,
    winnerVersionId: finalCandidate.versionId,
    judgeReasoning: finalCandidate.progressLabel || 'Redação final concluída.',
    judgeScores: {},
    completedAt: new Date().toISOString(),
  });

  await acceptDocumentMulti3Winner(sessionId, finalCandidate.provider, finalCandidate.versionId);
}

export async function createDocumentJudgeFinal(
  documentId: string,
  sessionId: string,
  completedCandidates: Multi3Candidate[],
  judgeProvider: AIProvider,
  judgeModel: string,
  commandArgs = ''
): Promise<Multi3Candidate> {
  const sourceCandidates = sourceMulti3Candidates(completedCandidates).filter(
    (candidate) => candidate.status === 'completed' && candidate.versionId
  );
  if (sourceCandidates.length === 0) {
    throw new Error('Nenhuma versão concluída está disponível para o redator final.');
  }

  const branchIndex = 3;
  const runningCandidate: Multi3Candidate = {
    provider: judgeProvider,
    model: judgeModel,
    judgeModel,
    role: 'judge-final',
    status: 'running',
    branchIndex,
    progress: 0,
    progressLabel: 'Preparando a redação final',
  };
  const current = await getMulti3Session(sessionId);
  await updateMulti3Session(sessionId, {
    candidates: replaceJudgeFinalCandidate(current?.candidates || sourceCandidates, runningCandidate),
  });

  const tempPaths: string[] = [];
  const outputPath = path.join(os.tmpdir(), `${randomUUID()}_document_judge_final.docx`);
  tempPaths.push(outputPath);

  try {
    const candidateDocuments = [];
    for (const candidate of sourceCandidates) {
      const filePath = await downloadDocumentFile(documentId, candidate.versionId!);
      tempPaths.push(filePath);
      candidateDocuments.push({
        provider: candidate.provider,
        model: candidate.model,
        filePath,
      });
    }

    const result = await synthesizeJudgeFinalDocument({
      candidates: candidateDocuments,
      outputPath,
      judgeProvider,
      judgeModel,
      apiKey: getApiKey(judgeProvider),
      commandArgs,
      cancelCheck: multi3CancelCheck(sessionId),
      onProgress: async (progress) => {
        await patchMulti3Candidate(sessionId, branchIndex, {
          ...runningCandidate,
          progress: progress.progress,
          progressLabel: progress.label,
          currentBatch: progress.currentBatch,
          totalBatches: progress.totalBatches,
        });
      },
    });

    const buffer = await fs.readFile(outputPath);
    const versionId = await archiveDocumentCandidate(
      documentId,
      buffer,
      `multi3_judge_final_${judgeProvider}`
    );
    const finalCandidate: Multi3Candidate = {
      provider: judgeProvider,
      model: judgeModel,
      judgeModel,
      role: 'judge-final',
      status: 'completed',
      branchIndex,
      progress: 100,
      progressLabel: result.reasoning,
      versionId,
      versionIds: [versionId],
      text: result.previewText,
      currentBatch: result.completedBatches + result.failedBatches,
      totalBatches: result.completedBatches + result.failedBatches,
    };
    const updated = await getMulti3Session(sessionId);
    await updateMulti3Session(sessionId, {
      candidates: replaceJudgeFinalCandidate(updated?.candidates || sourceCandidates, finalCandidate),
    });
    return finalCandidate;
  } catch (error: any) {
    const failedCandidate: Multi3Candidate = {
      ...runningCandidate,
      status: 'failed',
      error: error.message || String(error),
      progressLabel: 'Falha ao criar a redação final',
    };
    const updated = await getMulti3Session(sessionId);
    await updateMulti3Session(sessionId, {
      candidates: replaceJudgeFinalCandidate(updated?.candidates || sourceCandidates, failedCandidate),
    });
    throw error;
  } finally {
    await Promise.all(tempPaths.map((tempPath) => fs.unlink(tempPath).catch(() => {})));
  }
}

export async function acceptDocumentMulti3Winner(
  sessionId: string,
  provider?: AIProvider,
  versionId?: string
): Promise<Multi3Session> {
  const session = await getMulti3Session(sessionId);
  if (!session) throw new Error('Sessão não encontrada');

  const winner = versionId
    ? session.candidates.find((candidate) => candidate.versionId === versionId && candidate.status === 'completed')
    : provider
      ? session.candidates.find(
          (candidate) => candidate.role !== 'judge-final' && candidate.provider === provider && candidate.status === 'completed'
        )
      : session.winnerVersionId
      ? session.candidates.find(
          (candidate) => candidate.versionId === session.winnerVersionId && candidate.status === 'completed'
        )
      : session.candidates.find(
          (candidate) => candidate.provider === session.winnerProvider && candidate.status === 'completed'
        );
  if (!winner) throw new Error('Candidato não encontrado');
  const chosen = winner.provider;

  if (session.command === '/perguntar' || !winner.versionId) {
    await updateMulti3Session(sessionId, {
      status: 'accepted',
      winnerProvider: chosen,
      completedAt: new Date().toISOString(),
    });
    return (await getMulti3Session(sessionId))!;
  }

  const { data: doc } = await supabase.from('documents').select('*').eq('id', session.targetId).single();
  if (!doc) throw new Error('Document not found');

  const { data: fileBlob } = await supabase.storage.from('documents').download(winner.versionId);
  if (!fileBlob) throw new Error('Arquivo candidato não encontrado');

  const buffer = Buffer.from(await fileBlob.arrayBuffer());
  await persistDocumentVersion({
    documentId: session.targetId,
    title: doc.title,
    projectId: doc.project_id,
    buffer,
    operation: `multi3_${session.command.replace('/', '')}`,
  });

  await updateMulti3Session(sessionId, {
    status: 'accepted',
    winnerProvider: chosen,
    winnerVersionId: winner.versionId,
    completedAt: new Date().toISOString(),
  });

  return (await getMulti3Session(sessionId))!;
}
