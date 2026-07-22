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
import { buildDocumentContext } from '@/lib/document-processing/context';
import { translateDocx } from '@/lib/translation/docx-translator';
import { analyzeDocumentForAdaptation } from '@/lib/adapt/processor';
import { applySuggestionsToDocx, type ApplyDocxSuggestion } from '@/lib/translation/docx-translator';
import { extractDocumentStructure } from '@/lib/improvement/document-analyzer';
import { detectNormsInDocument } from '@/lib/norms-update/norm-detector';
import { verifyMultipleNorms } from '@/lib/norms-update/norm-verifier';
import { applyNormUpdatesToDocx } from '@/lib/norms-update/apply-docx';
import { AIProvider } from '@/lib/ai/types';
import { SupportedLanguage } from '@/lib/translation/types';
import { getApiKey } from '@/lib/multi-ai/chapter-helpers';

export type DocumentTodosConfig = {
  provider: AIProvider;
  model: string;
  targetLanguage: SupportedLanguage;
  adaptStyle: 'academic' | 'professional' | 'simplified' | 'custom';
  targetAudience?: string;
  multi3Meta?: Record<string, unknown>;
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

export async function runTodosPipeline(
  documentId: string,
  doc: { title: string; file_path: string; project_id?: string | null },
  config: DocumentTodosConfig
): Promise<DocumentTodosResult> {
  const tempPaths: string[] = [];
  const stepPaths: string[] = [];
  let normsPath = '';
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

    // Adapt
    const adaptedPath = path.join(os.tmpdir(), `${randomUUID()}_ad.docx`);
    tempPaths.push(adaptedPath);
    const adTransform = await runTransformWithMode(currentPath, adaptedPath, {
      task: 'adapt',
      provider: config.provider,
      model: config.model,
      adaptStyle: config.adaptStyle,
      targetAudience: config.targetAudience,
      skillContext: 'todos',
    });
    if (adTransform.runBatches) {
      const suggestions = await analyzeDocumentForAdaptation(
        currentPath,
        config.adaptStyle,
        config.targetAudience,
        config.provider,
        config.model,
        getApiKey(config.provider),
        undefined,
        undefined,
        undefined,
        'todos'
      );
      if (suggestions.length === 0) {
        await fs.copyFile(currentPath, adaptedPath);
      } else {
        const docxSuggestions: ApplyDocxSuggestion[] = suggestions.map((s: any) => ({
          id: s.id,
          originalText: s.originalText || '',
          improvedText: s.adaptedText || '',
        }));
        await applySuggestionsToDocx(currentPath, adaptedPath, docxSuggestions);
      }
    } else if (!adTransform.usedWhole) {
      throw new Error(adTransform.wholeError || 'adapt failed');
    }
    currentPath = adaptedPath;
    stepPaths.push(adaptedPath);

    if (!config.deferPersist) {
      const buf = await fs.readFile(adaptedPath);
      await persistDocumentVersion({
        documentId,
        title: doc.title,
        projectId: doc.project_id,
        buffer: buf,
        operation: 'adapt',
      });
    }

    // Norms
    normsPath = path.join(os.tmpdir(), `${randomUUID()}_nm.docx`);
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

    const { paragraphs: finalP } = await extractDocumentStructure(normsPath);
    const previewText = finalP.map((p) => p.text).join('\n\n').slice(0, 8000);

    return { previewText, stepPaths, finalPath: normsPath };
  } finally {
    const toDelete = config.deferPersist
      ? tempPaths.filter((p) => p !== normsPath)
      : tempPaths;
    await Promise.all(toDelete.map((p) => fs.unlink(p).catch(() => {})));
  }
}
