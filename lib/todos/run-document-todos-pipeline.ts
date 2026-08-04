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

export type DocumentTodosConfig = {
  provider: AIProvider;
  model: string;
  targetLanguage: SupportedLanguage;
  deferPersist?: boolean;
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
  config: DocumentTodosConfig
): Promise<void> {
  const transform = await runTransformWithMode(inputPath, outputPath, {
    task: 'adjust',
    provider: config.provider,
    model: config.model,
    adjustInstructions: instructions,
    skillContext: 'todos',
  });

  if (transform.runBatches) {
    const suggestions = await analyzeDocumentForAdjustments(
      inputPath,
      instructions,
      5,
      config.provider,
      config.model,
      getApiKey(config.provider),
      false
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

  try {
    // Translate
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
      });
      if (!r.success) throw new Error(r.error || 'translate failed');
    } else if (!trTransform.usedWhole) {
      throw new Error(trTransform.wholeError || 'translate failed');
    }
    currentPath = translatedPath;
    stepPaths.push(translatedPath);

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
    const references = await detectNormsInDocument(paragraphsWithContext, normsProvider, normsModel, getApiKey(normsProvider));

    if (references.length === 0) {
      await fs.copyFile(currentPath, normsPath);
    } else {
      const verified = await verifyMultipleNorms(references, normsProvider, normsModel, getApiKey(normsProvider));
      const toApply = verified.filter((r) => r.suggestedText);
      if (toApply.length === 0) {
        await fs.copyFile(currentPath, normsPath);
      } else {
        await applyNormUpdatesToDocx(currentPath, normsPath, toApply);
      }
    }
    stepPaths.push(normsPath);

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
    currentPath = normsPath;
    const improvedPath = path.join(os.tmpdir(), `${randomUUID()}_im.docx`);
    tempPaths.push(improvedPath);
    await runEditorialAdjustStep(
      currentPath,
      improvedPath,
      BOOK_IMPROVE_INSTRUCTIONS,
      config
    );
    stepPaths.push(improvedPath);

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
    currentPath = improvedPath;
    const finalizedPath = path.join(os.tmpdir(), `${randomUUID()}_fn.docx`);
    tempPaths.push(finalizedPath);
    await runEditorialAdjustStep(
      currentPath,
      finalizedPath,
      BOOK_FINALIZE_INSTRUCTIONS,
      config
    );
    stepPaths.push(finalizedPath);

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
