import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { supabase } from '@/lib/supabase';
import { createTranslationJob, executeTranslation } from '@/lib/translation/run-translation';
import { SupportedLanguage } from '@/lib/translation/types';
import { AIProvider } from '@/lib/ai/types';
import { extractDocumentStructure } from '@/lib/improvement/document-analyzer';
import { analyzeDocumentForAdaptation } from '@/lib/adapt/processor';
import { applySuggestionsToDocx, type ApplyDocxSuggestion } from '@/lib/translation/docx-translator';
import { detectNormsInDocument } from '@/lib/norms-update/norm-detector';
import { verifyMultipleNorms } from '@/lib/norms-update/norm-verifier';
import { applyNormUpdatesToDocx } from '@/lib/norms-update/apply-docx';
import { persistDocumentVersion } from '@/lib/document-versioning';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type TodosBody = {
  provider?: AIProvider;
  model?: string;
  targetLanguage?: SupportedLanguage;
  adaptStyle?: 'academic' | 'professional' | 'simplified' | 'custom';
  targetAudience?: string;
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: documentId } = await params;
    const body: TodosBody = await req.json().catch(() => ({}));

    const { data: doc, error } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single();

    if (error || !doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    const provider = body.provider || 'gemini';
    const model = body.model || 'gemini-2.5-flash';
    const targetLanguage = body.targetLanguage || 'pt';
    const adaptStyle = body.adaptStyle || 'simplified';

    runTodosPipeline(documentId, doc, {
      provider,
      model,
      targetLanguage,
      adaptStyle,
      targetAudience: body.targetAudience,
    }).catch((err) => {
      console.error(`[TODOS ${documentId}] Background error:`, err);
    });

    return NextResponse.json({
      message: '/todos started',
      documentId,
      sequence: ['translate', 'adapt', 'norms-update'],
    });
  } catch (error: any) {
    console.error('[TODOS] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function runTodosPipeline(
  documentId: string,
  doc: any,
  config: Required<Pick<TodosBody, 'provider' | 'model' | 'targetLanguage' | 'adaptStyle'>> & Pick<TodosBody, 'targetAudience'>
) {
  const tempPaths: string[] = [];

  try {
    const originalPath = await downloadDocumentToTemp(documentId, doc.file_path, 'todos_original');
    tempPaths.push(originalPath);
    let currentPath = originalPath;

    currentPath = await runTranslateStep(documentId, doc, currentPath, config);
    tempPaths.push(currentPath);

    const translatedBuffer = await fs.readFile(currentPath);
    const translatedVersion = await persistDocumentVersion({
      documentId,
      title: doc.title,
      projectId: doc.project_id,
      buffer: translatedBuffer,
      operation: 'todos_translate',
    });
    doc = { ...doc, file_path: translatedVersion.filePath };

    currentPath = await runAdaptStep(documentId, doc, currentPath, config);
    tempPaths.push(currentPath);

    const adaptedBuffer = await fs.readFile(currentPath);
    const adaptedVersion = await persistDocumentVersion({
      documentId,
      title: doc.title,
      projectId: doc.project_id,
      buffer: adaptedBuffer,
      operation: 'todos_adapt',
    });
    doc = { ...doc, file_path: adaptedVersion.filePath };

    currentPath = await runNormsStep(documentId, doc, currentPath, config);
    tempPaths.push(currentPath);

    const finalBuffer = await fs.readFile(currentPath);
    await persistDocumentVersion({
      documentId,
      title: doc.title,
      projectId: doc.project_id,
      buffer: finalBuffer,
      operation: 'todos_norms',
    });

    console.log(`[TODOS ${documentId}] Sequence completed`);
  } finally {
    await Promise.all(tempPaths.map((p) => fs.unlink(p).catch(() => {})));
  }
}

async function downloadDocumentToTemp(documentId: string, filePath: string, label: string): Promise<string> {
  const { data: fileBlob, error } = await supabase.storage.from('documents').download(filePath);
  if (error || !fileBlob) {
    throw new Error(`Failed to download document: ${error?.message || 'Unknown error'}`);
  }

  const tempPath = path.join(os.tmpdir(), `${documentId}_${label}_${randomUUID()}.docx`);
  await fs.writeFile(tempPath, Buffer.from(await fileBlob.arrayBuffer()));
  return tempPath;
}

async function runTranslateStep(
  documentId: string,
  doc: any,
  sourcePath: string,
  config: { provider: AIProvider; model: string; targetLanguage: SupportedLanguage }
): Promise<string> {
  const jobId = await createTranslationJob(documentId, {
    documentId,
    targetLanguage: config.targetLanguage,
    provider: config.provider,
    model: config.model,
    sourceDocumentPath: sourcePath,
  });

  await executeTranslation(jobId, documentId, doc, {
    documentId,
    targetLanguage: config.targetLanguage,
    provider: config.provider,
    model: config.model,
    sourceDocumentPath: sourcePath,
  });

  const { data: job, error } = await supabase
    .from('translation_jobs')
    .select('output_path')
    .eq('id', jobId)
    .single();

  if (error || !job?.output_path) {
    throw new Error('Translation finished without output_path');
  }

  const { data: fileBlob, error: downloadError } = await supabase.storage
    .from('translations')
    .download(job.output_path);

  if (downloadError || !fileBlob) {
    throw new Error(`Failed to download translated document: ${downloadError?.message || 'Unknown error'}`);
  }

  const outputPath = path.join(os.tmpdir(), `${documentId}_todos_translated_${randomUUID()}.docx`);
  await fs.writeFile(outputPath, Buffer.from(await fileBlob.arrayBuffer()));
  return outputPath;
}

async function runAdaptStep(
  documentId: string,
  doc: any,
  sourcePath: string,
  config: { provider: AIProvider; model: string; adaptStyle: 'academic' | 'professional' | 'simplified' | 'custom'; targetAudience?: string }
): Promise<string> {
  const jobId = randomUUID();
  const { error: insertError } = await supabase.from('adapt_jobs').insert({
    id: jobId,
    document_id: documentId,
    status: 'adapting',
    style: config.adaptStyle,
    target_audience: config.targetAudience || null,
    provider: config.provider,
    model: config.model,
    started_at: new Date().toISOString(),
  });
  if (insertError) throw new Error(`Failed to create adapt job: ${insertError.message}`);

  try {
    const { structure } = await extractDocumentStructure(sourcePath);
    await supabase
      .from('adapt_jobs')
      .update({ document_structure: structure, total_sections: structure.sections.length })
      .eq('id', jobId);

    const suggestions = await analyzeDocumentForAdaptation(
      sourcePath,
      config.adaptStyle,
      config.targetAudience,
      config.provider,
      config.model,
      getApiKey(config.provider)
    );

    await supabase
      .from('adapt_jobs')
      .update({
        status: 'completed',
        suggestions,
        progress_percentage: 100,
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId);

    if (suggestions.length === 0) return sourcePath;

    const outputPath = path.join(os.tmpdir(), `${documentId}_todos_adapted_${randomUUID()}.docx`);
    const docxSuggestions: ApplyDocxSuggestion[] = suggestions.map((s: any) => ({
      id: s.id,
      originalText: s.originalText || '',
      improvedText: s.adaptedText || '',
    }));
    await applySuggestionsToDocx(sourcePath, outputPath, docxSuggestions);
    return outputPath;
  } catch (error: any) {
    await supabase
      .from('adapt_jobs')
      .update({ status: 'error', error_message: error.message, completed_at: new Date().toISOString() })
      .eq('id', jobId);
    throw error;
  }
}

async function runNormsStep(
  documentId: string,
  doc: any,
  sourcePath: string,
  config: { provider: AIProvider; model: string }
): Promise<string> {
  const jobId = randomUUID();
  const { error: insertError } = await supabase.from('norm_update_jobs').insert({
    id: jobId,
    document_id: documentId,
    status: 'analyzing',
    norm_references: [],
    total_references: 0,
    vigentes: 0,
    alteradas: 0,
    revogadas: 0,
    substituidas: 0,
    manual_review: 0,
    current_reference: 0,
    progress_percentage: 0,
    started_at: new Date().toISOString(),
  });
  if (insertError) throw new Error(`Failed to create norms job: ${insertError.message}`);

  try {
    const { structure, paragraphs } = await extractDocumentStructure(sourcePath);
    const paragraphsWithContext = paragraphs
      .filter((p) => !p.isHeader)
      .map((p) => ({
        text: p.text,
        index: p.index,
        chapterTitle: structure.sections.find((s: any) =>
          p.index >= s.startParagraphIndex &&
          p.index <= s.endParagraphIndex &&
          s.level === 1
        )?.title,
      }));

    const normsProvider: 'openai' | 'gemini' | 'anthropic' =
      config.provider === 'grok' ? 'gemini' : config.provider;
    const normsModel = config.provider === 'grok' ? 'gemini-2.5-flash' : config.model;
    const normsApiKey = getApiKey(normsProvider);

    const references = await detectNormsInDocument(
      paragraphsWithContext,
      normsProvider,
      normsModel,
      normsApiKey
    );

    await supabase
      .from('norm_update_jobs')
      .update({ total_references: references.length, progress_percentage: 10 })
      .eq('id', jobId);

    if (references.length === 0) {
      await supabase
        .from('norm_update_jobs')
        .update({ status: 'completed', progress_percentage: 100, completed_at: new Date().toISOString() })
        .eq('id', jobId);
      return sourcePath;
    }

    const verifiedReferences = await verifyMultipleNorms(
      references,
      normsProvider,
      normsModel,
      normsApiKey,
      undefined,
      async (current, total) => {
        await supabase
          .from('norm_update_jobs')
          .update({
            current_reference: current,
            progress_percentage: 10 + Math.floor((current / total) * 90),
          })
          .eq('id', jobId);
      }
    );

    const stats = {
      vigentes: verifiedReferences.filter((r: any) => r.status === 'vigente').length,
      alteradas: verifiedReferences.filter((r: any) => r.status === 'alterada').length,
      revogadas: verifiedReferences.filter((r: any) => r.status === 'revogada').length,
      substituidas: verifiedReferences.filter((r: any) => r.status === 'substituida').length,
      manual_review: verifiedReferences.filter((r: any) => r.updateType === 'manual').length,
    };

    await supabase
      .from('norm_update_jobs')
      .update({
        status: 'completed',
        norm_references: verifiedReferences,
        ...stats,
        progress_percentage: 100,
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId);

    const referencesToApply = verifiedReferences.filter((r: any) => r.suggestedText);
    if (referencesToApply.length === 0) return sourcePath;

    const outputPath = path.join(os.tmpdir(), `${documentId}_todos_norms_${randomUUID()}.docx`);
    await applyNormUpdatesToDocx(sourcePath, outputPath, referencesToApply);
    return outputPath;
  } catch (error: any) {
    await supabase
      .from('norm_update_jobs')
      .update({ status: 'error', error_message: error.message, completed_at: new Date().toISOString() })
      .eq('id', jobId);
    throw error;
  }
}

function getApiKey(provider: AIProvider): string {
  const apiKey =
    provider === 'openai'
      ? process.env.OPENAI_API_KEY
      : provider === 'anthropic'
        ? process.env.ANTHROPIC_API_KEY
        : provider === 'grok'
          ? process.env.GROK_API_KEY
          : process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    throw new Error(`API key not configured for provider: ${provider}`);
  }

  return apiKey;
}
