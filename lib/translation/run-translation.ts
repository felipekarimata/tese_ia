import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { translateDocx } from '@/lib/translation/docx-translator';
import { TranslationOptions, SupportedLanguage } from '@/lib/translation/types';
import { AIProvider } from '@/lib/ai/types';
import { supabase } from '@/lib/supabase';

export type RunTranslationParams = {
  documentId: string;
  targetLanguage: SupportedLanguage;
  sourceLanguage?: SupportedLanguage;
  provider: AIProvider;
  model: string;
  maxPages?: number;
  sourceDocumentPath?: string;
};

/**
 * Create a translation job row in Supabase. Returns the new jobId.
 */
export async function createTranslationJob(
  documentId: string,
  params: RunTranslationParams
): Promise<string> {
  const jobId = randomUUID();
  const { error } = await supabase.from('translation_jobs').insert({
    id: jobId,
    document_id: documentId,
    target_language: params.targetLanguage,
    source_language: params.sourceLanguage ?? null,
    provider: params.provider,
    model: params.model,
    status: 'pending',
    total_chunks: 0
    // started_at será definido quando o status mudar para 'translating'
  });
  if (error) throw new Error(`Failed to create translation job: ${error.message}`);
  return jobId;
}

/**
 * Execute translation for a job (download/use input, translate, upload output, update job).
 * Used by both the API route (fire-and-forget) and the pipeline engine (await).
 */
export async function executeTranslation(
  jobId: string,
  documentId: string,
  doc: { file_path: string },
  params: RunTranslationParams
): Promise<void> {
  const {
    targetLanguage,
    sourceLanguage,
    provider,
    model,
    maxPages,
    sourceDocumentPath
  } = params;

  const tempDir = os.tmpdir();
  const tempInputPath =
    sourceDocumentPath || path.join(tempDir, `${jobId}_${documentId}_input.docx`);
  const tempOutputPath = path.join(
    tempDir,
    `${jobId}_${documentId}_output_${targetLanguage}.docx`
  );

  try {
    if (!sourceDocumentPath) {
      console.log('[TRANSLATE] Downloading original from Storage:', doc.file_path);
      const { data: fileBlob, error: downloadError } = await supabase.storage
        .from('documents')
        .download(doc.file_path);

      if (downloadError || !fileBlob) {
        throw new Error(`Failed to download: ${downloadError?.message}`);
      }

      const buffer = Buffer.from(await fileBlob.arrayBuffer());
      await fs.writeFile(tempInputPath, buffer);
    } else {
      try {
        await fs.access(sourceDocumentPath, fs.constants.R_OK);
      } catch {
        throw new Error(
          `Source document not found or not readable: ${sourceDocumentPath}`
        );
      }
      console.log('[TRANSLATE] Using source document from pipeline:', sourceDocumentPath);
    }

    const options: TranslationOptions = {
      targetLanguage,
      sourceLanguage,
      provider,
      model,
      maxPages,
      onProgress: async (progress) => {
        await supabase
          .from('translation_jobs')
          .update({
            status: progress.status,
            progress_percentage: progress.percentage,
            current_chunk: progress.currentChunk,
            total_chunks: progress.totalChunks,
            current_section: progress.currentSection ?? null,
            estimated_seconds_remaining: progress.estimatedSecondsRemaining ?? null,
            elapsed_seconds: progress.elapsedSeconds ?? null,
            stats: progress.stats ?? null
          })
          .eq('id', jobId);
      },
      onLog: (message) => {
        console.log(`[TRANSLATE ${jobId}] ${message}`);
      }
    };

    const result = await translateDocx(tempInputPath, tempOutputPath, options);

    if (!result.success) {
      throw new Error(result.error || 'Translation failed');
    }

    const outputFileName = `${path.parse(doc.file_path).name}_${targetLanguage}.docx`;
    const storagePath = `translations/${outputFileName}`;
    const translatedBuffer = await fs.readFile(tempOutputPath);

    console.log('[TRANSLATE] Uploading translated file to Storage:', storagePath);
    const { error: uploadError } = await supabase.storage
      .from('translations')
      .upload(storagePath, translatedBuffer, {
        contentType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        upsert: true
      });

    if (uploadError) {
      throw new Error(`Failed to upload: ${uploadError.message}`);
    }

    await supabase
      .from('translation_jobs')
      .update({
        status: 'completed',
        progress_percentage: 100,
        output_path: storagePath,
        stats: result.validationReport ?? null,
        completed_at: new Date().toISOString()
      })
      .eq('id', jobId);

    console.log('[TRANSLATE] Translation completed successfully:', jobId);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[TRANSLATE] Translation failed:', error);
    await supabase
      .from('translation_jobs')
      .update({ status: 'error', error_message: message })
      .eq('id', jobId);
    throw error;
  } finally {
    try {
      if (!sourceDocumentPath) await fs.unlink(tempInputPath);
    } catch {}
    try {
      await fs.unlink(tempOutputPath);
    } catch {}
  }
}
