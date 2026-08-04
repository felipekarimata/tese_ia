/**
 * Document /todos pipeline with whole-document mode (projects).
 */
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { supabase } from '@/lib/supabase';
import { persistDocumentVersion } from '@/lib/document-versioning';
import { runTransformWithMode } from '@/lib/document-processing/run-transform';
import { translateDocx } from '@/lib/translation/docx-translator';
import { analyzeDocumentForAdjustments } from '@/lib/adjust/processor';
import { applySuggestionsToDocx, type ApplyDocxSuggestion } from '@/lib/translation/docx-translator';
import { extractDocumentStructure } from '@/lib/improvement/document-analyzer';
import { detectNormsInDocument } from '@/lib/norms-update/norm-detector';
import { verifyMultipleNorms } from '@/lib/norms-update/norm-verifier';
import { applyNormUpdatesToDocx } from '@/lib/norms-update/apply-docx';
import { AIProvider } from '@/lib/ai/types';
import { SupportedLanguage } from '@/lib/translation/types';
import { getApiKey } from '@/lib/multi-ai/chapter-helpers';
import { BOOK_FINALIZE_INSTRUCTIONS, BOOK_IMPROVE_INSTRUCTIONS } from '@/lib/book-workflow/prompts';
import { stageOverallProgress } from '@/lib/multi-ai/progress';
import type { Multi3TodosStage } from '@/lib/multi-ai/types';

type DocumentTodosStage = Exclude<Multi3TodosStage, 'starting' | 'completed'>;

export type DocumentTodosProgress = {
  stage: DocumentTodosStage;
  stageProgress: number;
  progress: number;
  label: string;
  currentBatch?: number;
  totalBatches?: number;
};

export type DocumentTodosConfig = {
  provider: AIProvider;
  model: string;
  targetLanguage: SupportedLanguage;
  deferPersist?: boolean;
  onProgress?: (progress: DocumentTodosProgress) => void | Promise<void>;
};

export type DocumentTodosResult = {
  previewText: string;
  stepPaths: string[];
  finalPath?: string;
};

async function downloadDoc(filePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from('documents').download(filePath);
  if (error || !data) throw new Error(error?.message || 'download failed');
  const tmp = path.join(os.tmpdir(), `${randomUUID()}.docx`);
  await fs.writeFile(tmp, Buffer.from(await data.arrayBuffer()));
  return tmp;
}

async function runEditorialAdjustStep(
  inputPath: string,
  outputPath: string,
  instructions: string,
  config: DocumentTodosConfig,
  onProgress?: (stageProgress: number, label: string, currentBatch?: number, totalBatches?: number) => void | Promise<void>
): Promise<void> {
  const transform = await runTransformWithMode(inputPath, outputPath, {
    task: 'adjust',
    provider: config.provider,
    model: config.model,
    adjustInstructions: instructions,
    skillContext: 'todos',
  });

  if (transform.runBatches) {
    await onProgress?.(8, 'Preparando os lotes editoriais');
    const suggestions = await analyzeDocumentForAdjustments(
      inputPath,
      instructions,
      5,
      config.provider,
      config.model,
      getApiKey(config.provider),
      false,
      undefined,
      'todos',
      async (currentBatch, totalBatches) => {
        const stageProgress = 8 + Math.round((currentBatch / Math.max(1, totalBatches)) * 87);
        await onProgress?.(
          stageProgress,
          `Processando lote editorial ${currentBatch}/${totalBatches}`,
          currentBatch,
          totalBatches
        );
      }
    );
    if (suggestions.length === 0) {
      await fs.copyFile(inputPath, outputPath);
      return;
    }
    const docxSuggestions: ApplyDocxSuggestion[] = suggestions.map((suggestion: any) => ({
      id: suggestion.id,
      originalText: suggestion.originalText || '',
      improvedText: suggestion.adjustedText || suggestion.improvedText || '',
    }));
    await applySuggestionsToDocx(inputPath, outputPath, docxSuggestions);
    await onProgress?.(98, 'Aplicando as alterações ao documento');
    return;
  }

  if (!transform.usedWhole) {
    throw new Error(transform.wholeError || 'Falha no processamento editorial');
  }
}

export async function runTodosPipeline(
  documentId: string,
  doc: { title: string; file_path: string; project_id?: string | null },
  config: DocumentTodosConfig
): Promise<DocumentTodosResult> {
  const tempPaths: string[] = [];
  const stepPaths: string[] = [];
  let finalPath = '';
  let currentPath = await downloadDoc(doc.file_path);
  tempPaths.push(currentPath);

  const report = async (
    stage: DocumentTodosStage,
    stageProgress: number,
    label: string,
    currentBatch?: number,
    totalBatches?: number
  ) => {
    await config.onProgress?.({
      stage,
      stageProgress,
      progress: stageOverallProgress(stage, stageProgress),
      label,
      currentBatch,
      totalBatches,
    });
  };

  try {
    // Translate
    await report('translate', 0, 'Preparando tradução para português');
    const translatedPath = path.join(os.tmpdir(), `${randomUUID()}_tr.docx`);
    tempPaths.push(translatedPath);
    const trTransform = await runTransformWithMode(currentPath, translatedPath, {
      task: 'translate',
      provider: config.provider,
      model: config.model,
      targetLanguage: config.targetLanguage,
      skillContext: 'todos',
    });
    if (trTransform.runBatches) {
      const r = await translateDocx(currentPath, translatedPath, {
        targetLanguage: config.targetLanguage,
        provider: config.provider,
        model: config.model,
        onProgress: (translationProgress) => {
          void report(
            'translate',
            translationProgress.percentage,
            `Traduzindo lote ${translationProgress.currentChunk}/${translationProgress.totalChunks}`,
            translationProgress.currentChunk,
            translationProgress.totalChunks
          ).catch((error) => console.warn('[TODOS PROGRESS] translate', error));
        },
      });
      if (!r.success) throw new Error(r.error || 'translate failed');
    } else if (!trTransform.usedWhole) {
      throw new Error(trTransform.wholeError || 'translate failed');
    }
    currentPath = translatedPath;
    stepPaths.push(translatedPath);
    await report('translate', 100, 'Tradução concluída');

    if (!config.deferPersist) {
      const buf = await fs.readFile(translatedPath);
      await persistDocumentVersion({
        documentId,
        title: doc.title,
        projectId: doc.project_id,
        buffer: buf,
        operation: 'translate',
      });
    }

    // Review
    await report('review', 0, 'Preparando revisão de vigência, fatos e dados');
    const normsPath = path.join(os.tmpdir(), `${randomUUID()}_nm.docx`);
    tempPaths.push(normsPath);
    const { structure, paragraphs } = await extractDocumentStructure(currentPath);
    const paragraphsWithContext = paragraphs
      .filter((p) => !p.isHeader)
      .map((p) => ({
        text: p.text,
        index: p.index,
        chapterTitle: structure.sections.find((s) =>
          p.index >= s.startParagraphIndex && p.index <= s.endParagraphIndex && s.level === 1
        )?.title,
      }));

    const normsProvider: 'openai' | 'gemini' | 'anthropic' =
      config.provider === 'grok' ? 'gemini' : config.provider;
    const normsModel = config.provider === 'grok' ? 'gemini-2.5-flash' : config.model;
    const references = await detectNormsInDocument(
      paragraphsWithContext,
      normsProvider,
      normsModel,
      getApiKey(normsProvider),
      async (currentBatch, totalBatches) => {
        await report(
          'review',
          Math.round((currentBatch / Math.max(1, totalBatches)) * 55),
          `Detectando referências — lote ${currentBatch}/${totalBatches}`,
          currentBatch,
          totalBatches
        );
      }
    );

    if (references.length === 0) {
      await fs.copyFile(currentPath, normsPath);
    } else {
      const verified = await verifyMultipleNorms(
        references,
        normsProvider,
        normsModel,
        getApiKey(normsProvider),
        undefined,
        (current, total) => {
          void report(
            'review',
            55 + Math.round((current / Math.max(1, total)) * 40),
            `Verificando referência ${current}/${total}`,
            current,
            total
          ).catch((error) => console.warn('[TODOS PROGRESS] review', error));
        }
      );
      const toApply = verified.filter((r) => r.suggestedText);
      if (toApply.length === 0) {
        await fs.copyFile(currentPath, normsPath);
      } else {
        await applyNormUpdatesToDocx(currentPath, normsPath, toApply);
      }
    }
    stepPaths.push(normsPath);
    await report('review', 100, 'Revisão concluída');

    if (!config.deferPersist) {
      const buf = await fs.readFile(normsPath);
      await persistDocumentVersion({
        documentId,
        title: doc.title,
        projectId: doc.project_id,
        buffer: buf,
        operation: 'update',
      });
    }

    // Improve
    await report('improve', 0, 'Preparando aprimoramento de conteúdo e fontes');
    currentPath = normsPath;
    const improvedPath = path.join(os.tmpdir(), `${randomUUID()}_im.docx`);
    tempPaths.push(improvedPath);
    await runEditorialAdjustStep(
      currentPath,
      improvedPath,
      BOOK_IMPROVE_INSTRUCTIONS,
      config,
      (stageProgress, label, currentBatch, totalBatches) =>
        report('improve', stageProgress, label, currentBatch, totalBatches)
    );
    stepPaths.push(improvedPath);
    await report('improve', 100, 'Aprimoramento concluído');

    if (!config.deferPersist) {
      const buf = await fs.readFile(improvedPath);
      await persistDocumentVersion({
        documentId,
        title: doc.title,
        projectId: doc.project_id,
        buffer: buf,
        operation: 'improve',
      });
    }

    // Finalize
    await report('finalize', 0, 'Preparando finalização editorial');
    currentPath = improvedPath;
    const finalizedPath = path.join(os.tmpdir(), `${randomUUID()}_fn.docx`);
    tempPaths.push(finalizedPath);
    await runEditorialAdjustStep(
      currentPath,
      finalizedPath,
      BOOK_FINALIZE_INSTRUCTIONS,
      config,
      (stageProgress, label, currentBatch, totalBatches) =>
        report('finalize', stageProgress, label, currentBatch, totalBatches)
    );
    stepPaths.push(finalizedPath);
    await report('finalize', 100, 'Finalização concluída; preparando versão candidata');

    if (!config.deferPersist) {
      const buf = await fs.readFile(finalizedPath);
      await persistDocumentVersion({
        documentId,
        title: doc.title,
        projectId: doc.project_id,
        buffer: buf,
        operation: 'finalize',
      });
    }

    finalPath = finalizedPath;
    const { paragraphs: finalP } = await extractDocumentStructure(finalPath);
    const previewText = finalP.map((p) => p.text).join('\n\n').slice(0, 8000);

    return { previewText, stepPaths, finalPath };
  } finally {
    const toDelete = config.deferPersist
      ? tempPaths.filter((p) => p !== finalPath)
      : tempPaths;
    await Promise.all(toDelete.map((p) => fs.unlink(p).catch(() => {})));
  }
}
