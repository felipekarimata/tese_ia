import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { supabase } from '@/lib/supabase';
import { chatWithAgentLong } from '@/lib/ai/agent-chat';
import { extractParagraphsForPrompt } from '@/lib/document-processing/whole-document';
import { applySuggestionsToDocx } from '@/lib/translation/docx-translator';
import { downloadChapterVersionFile } from '@/lib/multi-ai/chapter-helpers';
import {
  mergePreparedChapterBuffers,
  uploadMergedDocument,
} from '@/lib/thesis/document-merger';
import {
  buildChapterDigest,
  attachOccurrenceIndexes,
  chunkBookParagraphs,
  constrainSuggestions,
  serializeBookParagraphs,
} from './document';
import {
  buildChapterHarmonizationPrompt,
  buildChapterSummaryPrompt,
  buildEditorialPlanPrompt,
} from './prompts';
import {
  parseBookSuggestions,
  parseChapterSummary,
  parseEditorialPlan,
} from './parsers';
import {
  getBookAssemblyJob,
  markBookJobFailed,
  updateBookAssemblyJob,
} from './repository';
import {
  analysisProgress,
  finalizationProgress,
  harmonizationProgress,
} from './progress';
import type {
  BookAssemblyJob,
  BookAssemblyResumeStage,
  BookChapterResult,
  BookChapterSelection,
  BookChapterSummary,
  BookSuggestion,
} from './types';

type ActiveBookJobs = Map<string, Promise<void>>;
const globalForBookAssembly = globalThis as typeof globalThis & {
  __activeBookAssemblyJobs?: ActiveBookJobs;
};
const activeJobs = globalForBookAssembly.__activeBookAssemblyJobs ?? new Map<string, Promise<void>>();
globalForBookAssembly.__activeBookAssemblyJobs = activeJobs;

async function callEditorialAI(job: BookAssemblyJob, systemPrompt: string, prompt: string): Promise<string> {
  if (!job.provider || !job.model) {
    throw new Error('Selecione um provedor e um modelo para a edição do livro');
  }

  let lastError: unknown;
  const heartbeat = setInterval(() => {
    void updateBookAssemblyJob(job.id, {}).catch((error) => {
      console.warn('[BOOK-ASSEMBLY] Heartbeat update failed:', error);
    });
  }, 30000);
  try {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        return await chatWithAgentLong({
          provider: job.provider,
          model: job.model,
          systemPrompt,
          history: [],
          userMessage: prompt,
        });
      } catch (error) {
        lastError = error;
        if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 1200));
      }
    }
  } finally {
    clearInterval(heartbeat);
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await mapper(items[index], index);
    }
  }

  const workers = Array.from(
    { length: Math.max(1, Math.min(concurrency, items.length)) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}

async function withDownloadedChapter<T>(
  selection: BookChapterSelection,
  label: string,
  callback: (filePath: string) => Promise<T>
): Promise<T> {
  const tempPath = await downloadChapterVersionFile(selection.versionId, selection.filePath, label);
  try {
    return await callback(tempPath);
  } finally {
    await fs.unlink(tempPath).catch(() => undefined);
  }
}

async function summarizeChapter(
  job: BookAssemblyJob,
  selection: BookChapterSelection
): Promise<BookChapterSummary> {
  return withDownloadedChapter(selection, 'book-summary', async (filePath) => {
    const paragraphs = await extractParagraphsForPrompt(filePath);
    const digest = buildChapterDigest(paragraphs);
    try {
      const response = await callEditorialAI(
        job,
        'Você resume capítulos técnicos com fidelidade e responde somente em JSON válido.',
        buildChapterSummaryPrompt({
          title: selection.chapterTitle,
          order: selection.order,
          digest,
        })
      );
      return parseChapterSummary(response, {
        chapterId: selection.chapterId,
        title: selection.chapterTitle,
        order: selection.order,
      });
    } catch (error) {
      console.warn('[BOOK-ASSEMBLY] Chapter summary fallback:', selection.chapterId, error);
      return parseChapterSummary(digest, {
        chapterId: selection.chapterId,
        title: selection.chapterTitle,
        order: selection.order,
      });
    }
  });
}

async function analyzeBook(job: BookAssemblyJob): Promise<void> {
  const total = job.chapterSelections.length;
  let completed = 0;
  let progressQueue = Promise.resolve();
  await updateBookAssemblyJob(job.id, {
    status: 'analyzing',
    resumeStage: 'analyzing',
    progress: 6,
    progressLabel: 'Lendo os capítulos selecionados',
    startedAt: job.startedAt || new Date().toISOString(),
    errorMessage: null,
  });

  const summaries = await mapWithConcurrency(job.chapterSelections, 2, async (selection) => {
    const summary = await summarizeChapter(job, selection);
    const current = ++completed;
    progressQueue = progressQueue.then(() => updateBookAssemblyJob(job.id, {
      progress: analysisProgress(current, total),
      currentChapterIndex: current,
      progressLabel: `Analisando capítulos: ${current} de ${total}`,
    }));
    await progressQueue;
    return summary;
  });

  await updateBookAssemblyJob(job.id, {
    progress: 36,
    progressLabel: 'Construindo o mapa editorial da obra',
  });

  const response = await callEditorialAI(
    job,
    'Você é um editor-chefe de livros técnicos. Responda somente em JSON válido e em português brasileiro.',
    buildEditorialPlanPrompt({
      title: job.title,
      mode: job.mode === 'structural' ? 'structural' : 'harmonize',
      summaries,
      customInstructions: job.customInstructions,
    })
  );
  const plan = parseEditorialPlan(response, summaries);

  await updateBookAssemblyJob(job.id, {
    status: 'awaiting_plan_approval',
    editorialPlan: plan,
    progress: 40,
    progressLabel: 'Plano editorial pronto para aprovação',
    currentChapterIndex: 0,
    resumeStage: null,
  });
}

async function harmonizeChapter(
  job: BookAssemblyJob,
  selection: BookChapterSelection,
  summaries: BookChapterSummary[]
): Promise<BookChapterResult> {
  const warnings: string[] = [];

  try {
    return await withDownloadedChapter(selection, 'book-harmonize', async (filePath) => {
      const paragraphs = await extractParagraphsForPrompt(filePath);
      const chunks = chunkBookParagraphs(paragraphs);
      const summaryIndex = summaries.findIndex((item) => item.chapterId === selection.chapterId);
      const guidance = job.editorialPlan?.chapterGuidance.find(
        (item) => item.chapterId === selection.chapterId
      );
      const suggestions: BookSuggestion[] = [];
      let chunksProcessed = 0;
      let chunksFailed = 0;

      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
        const chunk = chunks[chunkIndex];
        try {
          const response = await callEditorialAI(
            job,
            'Você é um redator final cuidadoso. Edite somente o necessário, preserve o mérito e responda apenas em JSON válido.',
            buildChapterHarmonizationPrompt({
              mode: job.mode === 'structural' ? 'structural' : 'harmonize',
              title: selection.chapterTitle,
              chapterId: selection.chapterId,
              chapterOrder: selection.order,
              chunkNumber: chunkIndex + 1,
              totalChunks: chunks.length,
              paragraphs: serializeBookParagraphs(chunk),
              plan: job.editorialPlan!,
              guidance,
              previousSummary: summaryIndex > 0 ? summaries[summaryIndex - 1] : undefined,
              nextSummary: summaryIndex >= 0 && summaryIndex < summaries.length - 1
                ? summaries[summaryIndex + 1]
                : undefined,
              customInstructions: job.customInstructions,
            })
          );
          suggestions.push(...parseBookSuggestions({
            response,
            chapterId: selection.chapterId,
            chapterTitle: selection.chapterTitle,
            paragraphs: chunk,
          }));
          chunksProcessed++;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          warnings.push(`Trecho ${chunkIndex + 1}: ${message}`);
          chunksFailed++;
        }
      }

      const unique = attachOccurrenceIndexes(
        [...new Map(suggestions.map((suggestion) => [suggestion.id, suggestion])).values()],
        paragraphs
      );
      const constrained = constrainSuggestions(
        unique,
        paragraphs.length,
        job.mode === 'structural' ? 'structural' : 'harmonize'
      );

      return {
        chapterId: selection.chapterId,
        chapterTitle: selection.chapterTitle,
        order: selection.order,
        paragraphCount: paragraphs.length,
        chunksProcessed,
        chunksFailed,
        suggestions: constrained.accepted,
        warnings: [...warnings, ...constrained.warnings],
      };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      chapterId: selection.chapterId,
      chapterTitle: selection.chapterTitle,
      order: selection.order,
      paragraphCount: 0,
      chunksProcessed: 0,
      chunksFailed: 1,
      suggestions: [],
      warnings: [`Não foi possível processar este capítulo: ${message}`],
    };
  }
}

async function harmonizeBook(job: BookAssemblyJob): Promise<void> {
  if (!job.editorialPlan) throw new Error('O plano editorial não foi encontrado');

  const total = job.chapterSelections.length;
  let completed = 0;
  let progressQueue = Promise.resolve();
  await updateBookAssemblyJob(job.id, {
    status: 'harmonizing',
    resumeStage: 'harmonizing',
    progress: 42,
    progressLabel: 'Preparando a redação editorial dos capítulos',
    errorMessage: null,
  });

  const results = await mapWithConcurrency(job.chapterSelections, 2, async (selection) => {
    const result = await harmonizeChapter(job, selection, job.editorialPlan!.chapterSummaries);
    const current = ++completed;
    progressQueue = progressQueue.then(() => updateBookAssemblyJob(job.id, {
      progress: harmonizationProgress(current, total),
      currentChapterIndex: current,
      progressLabel: `Harmonizando capítulos: ${current} de ${total}`,
    }));
    await progressQueue;
    return result;
  });

  if (results.every((result) => result.chunksProcessed === 0 && result.chunksFailed > 0)) {
    throw new Error('Nenhum capítulo pôde ser harmonizado. Verifique o provedor e retome esta etapa.');
  }

  await updateBookAssemblyJob(job.id, {
    status: 'awaiting_changes_approval',
    chapterResults: results.sort((a, b) => a.order - b.order),
    progress: 80,
    progressLabel: 'Alterações prontas para revisão',
    currentChapterIndex: 0,
    resumeStage: null,
  });
}

async function findExistingThesisVersion(jobId: string, thesisId: string): Promise<any | null> {
  const { data, error } = await (supabase as any)
    .from('thesis_versions')
    .select('id, version_number, file_path')
    .eq('thesis_id', thesisId)
    .contains('metadata', { bookAssemblyJobId: jobId })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) console.warn('[BOOK-ASSEMBLY] Existing version lookup failed:', error.message);
  return data || null;
}

async function createThesisVersion(params: {
  job: BookAssemblyJob;
  filePath: string;
  report: { requestedSuggestions: number; appliedSuggestions: number; unmatchedSuggestions: number; chaptersProcessed: number };
}): Promise<{ id: string; versionNumber: number }> {
  const existing = await findExistingThesisVersion(params.job.id, params.job.thesisId);
  if (existing) return { id: existing.id, versionNumber: existing.version_number };

  const metadata = {
    kind: 'book-edition',
    bookAssemblyJobId: params.job.id,
    title: params.job.title,
    mode: params.job.mode,
    provider: params.job.provider,
    model: params.job.model,
    compiledAt: new Date().toISOString(),
    finalizationReport: params.report,
  };
  const chaptersIncluded = params.job.chapterSelections.map((selection) => ({
    chapterId: selection.chapterId,
    versionId: selection.versionId,
    chapterOrder: selection.order,
    chapterTitle: selection.chapterTitle,
  }));
  const totalPages = params.job.chapterSelections.reduce(
    (sum, selection) => sum + (selection.pages || 0),
    0
  );

  const { data: versionId, error: rpcError } = await (supabase as any).rpc(
    'create_thesis_version',
    {
      p_thesis_id: params.job.thesisId,
      p_file_path: params.filePath,
      p_total_pages: totalPages,
      p_chapters_included: chaptersIncluded,
      p_metadata: metadata,
    }
  );

  if (!rpcError && versionId) {
    const { data: row, error } = await (supabase as any)
      .from('thesis_versions')
      .select('id, version_number')
      .eq('id', versionId)
      .single();
    if (!error && row) return { id: row.id, versionNumber: row.version_number };
  }

  const { data: latest } = await (supabase as any)
    .from('thesis_versions')
    .select('version_number')
    .eq('thesis_id', params.job.thesisId)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle();
  const versionNumber = Number(latest?.version_number || 0) + 1;
  const { data: inserted, error: insertError } = await (supabase as any)
    .from('thesis_versions')
    .insert({
      thesis_id: params.job.thesisId,
      version_number: versionNumber,
      file_path: params.filePath,
      total_pages: totalPages,
      chapters_included: chaptersIncluded,
      metadata,
    })
    .select('id, version_number')
    .single();
  if (insertError || !inserted) {
    throw new Error(`Falha ao registrar a versão do livro: ${insertError?.message || 'erro desconhecido'}`);
  }
  return { id: inserted.id, versionNumber: inserted.version_number };
}

async function finalizeBook(job: BookAssemblyJob): Promise<void> {
  const total = job.chapterSelections.length;
  const approved = new Set(job.approvedSuggestionIds);
  const allSuggestions = job.chapterResults.flatMap((result) => result.suggestions);
  const approvedSuggestions = allSuggestions.filter((suggestion) => approved.has(suggestion.id));
  let appliedSuggestions = 0;
  let unmatchedSuggestions = 0;
  const chapterBuffers: Buffer[] = [];
  const tempPaths: string[] = [];

  await updateBookAssemblyJob(job.id, {
    status: 'finalizing',
    resumeStage: 'finalizing',
    progress: 84,
    progressLabel: 'Aplicando as alterações aprovadas',
    errorMessage: null,
  });

  try {
    for (let index = 0; index < job.chapterSelections.length; index++) {
      const selection = job.chapterSelections[index];
      const sourcePath = await downloadChapterVersionFile(
        selection.versionId,
        selection.filePath,
        'book-final'
      );
      tempPaths.push(sourcePath);
      const chapterSuggestions = approvedSuggestions.filter(
        (suggestion) => suggestion.chapterId === selection.chapterId
      );
      let outputPath = sourcePath;

      if (chapterSuggestions.length > 0) {
        outputPath = path.join(os.tmpdir(), `${job.id}_${selection.chapterId}_${randomUUID()}.docx`);
        tempPaths.push(outputPath);
        const result = await applySuggestionsToDocx(
          sourcePath,
          outputPath,
          chapterSuggestions.map((suggestion) => ({
            id: suggestion.id,
            originalText: suggestion.originalText,
            improvedText: suggestion.improvedText,
            occurrenceIndex: suggestion.occurrenceIndex,
          }))
        );
        appliedSuggestions += result.appliedCount;
        unmatchedSuggestions += result.unmatchedCount;
      }

      chapterBuffers.push(await fs.readFile(outputPath));
      await updateBookAssemblyJob(job.id, {
        progress: finalizationProgress(index + 1, total),
        currentChapterIndex: index + 1,
        progressLabel: `Preparando documento final: ${index + 1} de ${total}`,
      });
    }

    const merged = await mergePreparedChapterBuffers(chapterBuffers, {
      includeCoverPage: job.includeCoverPage,
      thesisTitle: job.title,
      customTitle: job.title,
    });
    const storagePath = await uploadMergedDocument(
      merged,
      job.thesisId,
      `book-${job.id}`,
      { upsert: true }
    );
    const report = {
      requestedSuggestions: approvedSuggestions.length,
      appliedSuggestions,
      unmatchedSuggestions,
      chaptersProcessed: total,
    };
    const version = await createThesisVersion({ job, filePath: storagePath, report });

    await updateBookAssemblyJob(job.id, {
      status: 'completed',
      progress: 100,
      progressLabel: `Livro concluído — versão ${version.versionNumber}`,
      currentChapterIndex: total,
      resumeStage: null,
      resultThesisVersionId: version.id,
      finalizationReport: report,
      completedAt: new Date().toISOString(),
    });
  } finally {
    await Promise.all(tempPaths.map((tempPath) => fs.unlink(tempPath).catch(() => undefined)));
  }
}

async function runBookAssemblyJob(jobId: string): Promise<void> {
  let stage: BookAssemblyResumeStage = 'analyzing';
  try {
    let job = await getBookAssemblyJob(jobId);
    if (!job) throw new Error('Montagem de livro não encontrada');

    if (job.status === 'queued') {
      stage = job.mode === 'compile' ? 'finalizing' : 'analyzing';
      await updateBookAssemblyJob(job.id, {
        status: stage,
        resumeStage: stage,
        startedAt: job.startedAt || new Date().toISOString(),
      });
      job = (await getBookAssemblyJob(job.id))!;
    } else if (job.status === 'failed' && job.resumeStage) {
      stage = job.resumeStage;
      await updateBookAssemblyJob(job.id, { status: stage, errorMessage: null });
      job = (await getBookAssemblyJob(job.id))!;
    } else if (job.status === 'analyzing' || job.status === 'harmonizing' || job.status === 'finalizing') {
      stage = job.status;
    } else {
      return;
    }

    if (stage === 'analyzing') await analyzeBook(job);
    else if (stage === 'harmonizing') await harmonizeBook(job);
    else await finalizeBook(job);
  } catch (error) {
    console.error(`[BOOK-ASSEMBLY] Job ${jobId} failed during ${stage}:`, error);
    try {
      await markBookJobFailed(jobId, stage, error);
    } catch (updateError) {
      console.error('[BOOK-ASSEMBLY] Failed to persist job error:', updateError);
    }
  }
}

export function startBookAssemblyJob(jobId: string): void {
  const active = activeJobs.get(jobId);
  if (active) {
    void active.finally(() => {
      if (!activeJobs.has(jobId)) startBookAssemblyJob(jobId);
    });
    return;
  }
  const promise = runBookAssemblyJob(jobId).finally(() => activeJobs.delete(jobId));
  activeJobs.set(jobId, promise);
}

export function isBookAssemblyJobActive(jobId: string): boolean {
  return activeJobs.has(jobId);
}
