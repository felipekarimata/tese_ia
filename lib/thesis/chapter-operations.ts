import { supabase } from '@/lib/supabase';
import { translateDocx } from '@/lib/translation/docx-translator';
import { extractDocumentStructure, generateGlobalContext } from '@/lib/improvement/document-analyzer';
import { analyzeSectionForImprovements } from '@/lib/improvement/section-analyzer';
import { analyzeDocumentForAdjustments } from '@/lib/adjust/processor';
import { AIProvider } from '@/lib/ai/types';
import { isGemini429, parseGeminiRetryDelayMs, sleep } from '@/lib/ai/gemini-retry';
import { isOpenAIGpt5Family } from '@/lib/ai/openai-compat';
import { SupportedLanguage } from '@/lib/translation/types';
import { processChapterVersion } from './chapter-processor';
import { processReferences, formatReferencesForContext, type ReferenceInput } from './reference-processor';
import type { OperationContextSummary } from './types';
import { throwIfCancelled, isCancelledError, CANCELLATION_MARKER, clearCancellation } from '@/lib/job-cancellation';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';

export type ChapterOperation = 'improve' | 'translate' | 'adjust' | 'adapt' | 'update';

/**
 * Persist cancellation as an error with a recognizable marker so the UI can
 * differentiate it from a real failure. Returns true if the error was a
 * cancellation (caller can decide whether to swallow the throw).
 */
async function recordCancellationIfApplicable(jobId: string, error: unknown, opLabel: string): Promise<boolean> {
  if (isCancelledError(error)) {
    console.log(`[${opLabel}] Job ${jobId} cancelled by user — stopping pipeline`);
    try {
      await updateOperationJob(jobId, {
        status: 'error',
        errorMessage: `${CANCELLATION_MARKER} Cancelado pelo usuário antes de mais chamadas à IA.`,
      });
    } catch (e) {
      console.warn('[CANCEL] Failed to record cancellation in DB:', e);
    } finally {
      clearCancellation(jobId);
    }
    return true;
  }
  return false;
}

export interface OperationJobStatus {
  id: string;
  chapterId: string;
  versionId: string;
  operation: ChapterOperation;
  status: 'pending' | 'processing' | 'completed' | 'error';
  progress: number;
  errorMessage?: string;
  newVersionId?: string;
  createdAt: string;
  completedAt?: string;
}

/**
 * Cria job de operação e retorna ID
 */
export async function createOperationJob(
  chapterId: string,
  versionId: string,
  operation: ChapterOperation
): Promise<string> {
  const jobId = randomUUID();

  const { error } = await supabase.from('chapter_operation_jobs').insert({
    id: jobId,
    chapter_id: chapterId,
    version_id: versionId,
    operation,
    status: 'pending',
    progress: 0,
    created_at: new Date().toISOString()
  });

  if (error) {
    throw new Error(`Failed to create operation job: ${error.message}`);
  }

  return jobId;
}

/**
 * Atualiza status do job
 */
export async function updateOperationJob(
  jobId: string,
  updates: Partial<OperationJobStatus>
): Promise<void> {
  // Convert camelCase to snake_case for database
  const dbUpdates: any = {};

  if (updates.status !== undefined) dbUpdates.status = updates.status;
  if (updates.progress !== undefined) dbUpdates.progress = updates.progress;
  if (updates.errorMessage !== undefined) dbUpdates.error_message = updates.errorMessage;
  if (updates.newVersionId !== undefined) dbUpdates.new_version_id = updates.newVersionId;
  if (updates.completedAt !== undefined) dbUpdates.completed_at = updates.completedAt;

  const { error } = await supabase
    .from('chapter_operation_jobs')
    .update(dbUpdates)
    .eq('id', jobId);

  if (error) {
    console.error('[CHAPTER-OPS] Failed to update job:', error);
  }
}

/**
 * Busca status do job
 */
export async function getOperationJob(jobId: string): Promise<OperationJobStatus | null> {
  const { data, error } = await supabase
    .from('chapter_operation_jobs')
    .select('*')
    .eq('id', jobId)
    .single();

  if (error || !data) {
    return null;
  }

  return {
    id: data.id,
    chapterId: data.chapter_id,
    versionId: data.version_id,
    operation: data.operation,
    status: data.status,
    progress: data.progress,
    errorMessage: data.error_message,
    newVersionId: data.new_version_id,
    createdAt: data.created_at,
    completedAt: data.completed_at
  };
}

/**
 * Executa operação de melhoria em um capítulo
 */
export async function executeImproveOperation(
  jobId: string,
  chapterId: string,
  versionId: string,
  provider: AIProvider,
  model: string,
  references: ReferenceInput[] = [],
  contextVersionIds: string[] = []
): Promise<string> {
  try {
    console.log(`[CHAPTER-IMPROVE] Starting job ${jobId} for version ${versionId}`);

    await updateOperationJob(jobId, { status: 'processing', progress: 10 });

    // Busca versão atual
    const { data: version, error: versionError } = await supabase
      .from('chapter_versions')
      .select('*')
      .eq('id', versionId)
      .single();

    if (versionError || !version) {
      throw new Error('Version not found');
    }

    // Baixa arquivo do Storage
    const { data: fileBlob, error: downloadError } = await supabase.storage
      .from('documents')
      .download(version.file_path);

    if (downloadError || !fileBlob) {
      throw new Error(`Failed to download file: ${downloadError?.message}`);
    }

    const tempDir = os.tmpdir();
    const sourcePath = path.join(tempDir, `${jobId}_${versionId}_source.docx`);
    const buffer = Buffer.from(await fileBlob.arrayBuffer());
    await fs.writeFile(sourcePath, buffer);

    await updateOperationJob(jobId, { progress: 20 });

    // Extrai estrutura do documento
    console.log(`[CHAPTER-IMPROVE] Extracting structure...`);
    const { structure, paragraphs } = await extractDocumentStructure(sourcePath);

    await updateOperationJob(jobId, { progress: 30 });

    // Process references if provided
    let referencesContext = '';
    if (references && references.length > 0) {
      console.log(`[CHAPTER-IMPROVE] Processing ${references.length} references...`);
      const processedRefs = await processReferences(references);
      referencesContext = formatReferencesForContext(processedRefs);
      console.log(`[CHAPTER-IMPROVE] References processed, context length: ${referencesContext.length} chars`);
    }

    // Build chapter context if provided
    const { context: chapterContext, summary: contextSummary } = await buildChapterContextForOperation(contextVersionIds);

    // Combine all contexts
    const combinedContext = referencesContext + chapterContext;

    // Gera contexto global
    console.log(`[CHAPTER-IMPROVE] Generating global context...`);
    const apiKey =
      provider === 'openai'
        ? process.env.OPENAI_API_KEY!
        : provider === 'anthropic'
          ? process.env.ANTHROPIC_API_KEY!
          : (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)!;

    const contextProvider: 'openai' | 'gemini' | 'anthropic' =
      provider === 'anthropic' ? 'anthropic' : provider === 'openai' ? 'openai' : 'gemini';

    const globalContext = await generateGlobalContext(
      paragraphs,
      structure,
      contextProvider,
      model,
      apiKey,
      combinedContext // Pass combined context (references + chapters)
    );

    await updateOperationJob(jobId, { progress: 40 });

    console.log(`[CHAPTER-IMPROVE] Analyzing ${structure.sections.length} sections...`);

    // Analisa cada seção
    const allSuggestions: any[] = [];
    const BATCH_SIZE = 20;

    for (let i = 0; i < structure.sections.length; i++) {
      // Cancellation checkpoint between sections
      throwIfCancelled(jobId);

      const section = structure.sections[i];
      const sectionParagraphs = paragraphs
        .slice(section.startParagraphIndex, section.endParagraphIndex + 1)
        .filter(p => !p.isHeader)
        .map(p => p.text);

      const suggestions = await analyzeSectionForImprovements(
        sectionParagraphs,
        globalContext,
        section.title,
        section.startParagraphIndex,
        contextProvider,
        model,
        apiKey
      );

      allSuggestions.push(...suggestions);

      // Atualiza progresso (40-80%)
      const sectionProgress = 40 + Math.round((i + 1) / structure.sections.length * 40);
      await updateOperationJob(jobId, { progress: sectionProgress });
    }

    await updateOperationJob(jobId, { progress: 80 });

    // Cria nova versão do capítulo
    const newVersionId = await createNewChapterVersion(
      chapterId,
      versionId,
      sourcePath,
      'improve',
      {
        suggestions: allSuggestions,
        globalContext,
        contextChapters: contextSummary
      }
    );

    await updateOperationJob(jobId, { progress: 90 });

    // Processa chunks da nova versão
    await processChapterVersion(newVersionId);

    // Limpa arquivo temporário
    try {
      await fs.unlink(sourcePath);
    } catch {}

    await updateOperationJob(jobId, {
      status: 'completed',
      progress: 100,
      newVersionId,
      completedAt: new Date().toISOString()
    });

    console.log(`[CHAPTER-IMPROVE] Job ${jobId} completed! Created version ${newVersionId}`);
    return newVersionId;

  } catch (error: any) {
    if (await recordCancellationIfApplicable(jobId, error, 'CHAPTER-IMPROVE')) {
      return '';
    }
    console.error('[CHAPTER-IMPROVE] Error:', error);
    await updateOperationJob(jobId, {
      status: 'error',
      errorMessage: error.message
    });
    throw error;
  }
}

/**
 * Executa operação de tradução em um capítulo
 */
export async function executeTranslateOperation(
  jobId: string,
  chapterId: string,
  versionId: string,
  targetLanguage: SupportedLanguage,
  sourceLanguage: SupportedLanguage | undefined,
  provider: AIProvider,
  model: string,
  maxPages?: number,
  references: ReferenceInput[] = []
): Promise<string> {
  try {
    console.log(`[CHAPTER-TRANSLATE] Starting job ${jobId} for version ${versionId}`);

    await updateOperationJob(jobId, { status: 'processing', progress: 10 });

    // Busca versão atual
    const { data: version, error: versionError } = await supabase
      .from('chapter_versions')
      .select('*')
      .eq('id', versionId)
      .single();

    if (versionError || !version) {
      throw new Error('Version not found');
    }

    // Baixa arquivo do Storage
    const { data: fileBlob, error: downloadError } = await supabase.storage
      .from('documents')
      .download(version.file_path);

    if (downloadError || !fileBlob) {
      throw new Error(`Failed to download file: ${downloadError?.message}`);
    }

    const tempDir = os.tmpdir();
    const sourcePath = path.join(tempDir, `${jobId}_${versionId}_source.docx`);
    const outputPath = path.join(tempDir, `${jobId}_${versionId}_translated.docx`);
    const buffer = Buffer.from(await fileBlob.arrayBuffer());
    await fs.writeFile(sourcePath, buffer);

    await updateOperationJob(jobId, { progress: 20 });

    // Get API key
    const apiKey = getAPIKey(provider);

    // Process references (if any)
    let referenceContext = '';
    if (references.length > 0) {
      console.log(`[CHAPTER-TRANSLATE] Processing ${references.length} references...`);
      referenceContext = await processReferences(references, jobId);
      console.log(`[CHAPTER-TRANSLATE] Reference context length: ${referenceContext.length} chars`);
    }

    await updateOperationJob(jobId, { progress: 40 });

    // Generate translation suggestions
    console.log(`[CHAPTER-TRANSLATE] Generating translation suggestions to ${targetLanguage}...`);

    const { extractDocumentStructure } = await import('@/lib/improvement/document-analyzer');
    const { structure, paragraphs } = await extractDocumentStructure(sourcePath);

    const allSuggestions: any[] = [];
    const BATCH_SIZE = 10; // Smaller batches for translation

    for (let i = 0; i < structure.sections.length; i++) {
      // Cancellation checkpoint between sections — stops before paying for next section's batches
      throwIfCancelled(jobId);

      const section = structure.sections[i];
      const sectionParagraphs = paragraphs
        .slice(section.startParagraphIndex, section.endParagraphIndex + 1)
        .filter(p => !p.isHeader)
        .map(p => ({ text: p.text, index: p.index }));

      console.log(`[CHAPTER-TRANSLATE] Translating section ${i + 1}/${structure.sections.length}: "${section.title.substring(0, 50)}"`);

      // Process section in batches
      for (let batchStart = 0; batchStart < sectionParagraphs.length; batchStart += BATCH_SIZE) {
        // Cancellation checkpoint between batches — finest-grained guard before paid AI call
        throwIfCancelled(jobId);

        const batchEnd = Math.min(batchStart + BATCH_SIZE, sectionParagraphs.length);
        const batch = sectionParagraphs.slice(batchStart, batchEnd);

        const suggestions = await generateTranslationSuggestions(
          batch,
          section.title,
          targetLanguage,
          sourceLanguage,
          provider as 'openai' | 'gemini' | 'grok' | 'anthropic',
          model,
          apiKey
        );

        allSuggestions.push(...suggestions);
      }

      // Update progress (40-75%)
      const sectionProgress = 40 + Math.round((i + 1) / structure.sections.length * 35);
      await updateOperationJob(jobId, { progress: sectionProgress });
    }

    console.log(`[CHAPTER-TRANSLATE] Generated ${allSuggestions.length} translation suggestions`);

    await updateOperationJob(jobId, { progress: 80 });

    // Create placeholder version (translations will be applied when user accepts them)
    const newVersionId = await createNewChapterVersion(
      chapterId,
      versionId,
      sourcePath, // Use source path as placeholder
      'translate',
      { targetLanguage, sourceLanguage, suggestionsCount: allSuggestions.length }
    );

    await updateOperationJob(jobId, { progress: 85 });

    // Process chunks
    await processChapterVersion(newVersionId);

    await updateOperationJob(jobId, { progress: 95 });

    // Save suggestions to job metadata
    const { error: updateError } = await supabase
      .from('chapter_operation_jobs')
      .update({
        status: 'completed',
        progress: 100,
        new_version_id: newVersionId,
        completed_at: new Date().toISOString(),
        metadata: {
          targetLanguage,
          sourceLanguage,
          suggestions: allSuggestions.map((s: any) => ({
            id: s.id,
            type: 'translation',
            originalText: s.originalText || '',
            improvedText: s.translatedText || '',
            reason: `Translated to ${targetLanguage}`,
            confidence: 0.95,
            chapterTitle: s.sectionTitle || ''
          }))
        }
      })
      .eq('id', jobId);

    if (updateError) {
      console.error('[CHAPTER-TRANSLATE] Failed to save metadata:', updateError);
      throw new Error(`Failed to save suggestions: ${updateError.message}`);
    }

    // Clean up
    try {
      await fs.unlink(sourcePath);
    } catch {}

    console.log(`[CHAPTER-TRANSLATE] Job ${jobId} completed! Created version ${newVersionId}`);
    return newVersionId;

  } catch (error: any) {
    if (await recordCancellationIfApplicable(jobId, error, 'CHAPTER-TRANSLATE')) {
      return ''; // cancelled — no new version
    }
    console.error('[CHAPTER-TRANSLATE] Error:', error);
    await updateOperationJob(jobId, {
      status: 'error',
      errorMessage: error.message
    });
    throw error;
  }
}

/**
 * Cria nova versão do capítulo com arquivo processado
 */
async function createNewChapterVersion(
  chapterId: string,
  parentVersionId: string,
  filePath: string,
  operation: ChapterOperation,
  metadata: Record<string, any> = {}
): Promise<string> {
  const newVersionId = randomUUID();

  // Lê arquivo processado
  const fileBuffer = await fs.readFile(filePath);

  // Upload para Storage
  const fileName = `${newVersionId}.docx`;
  const { data: chapter } = await supabase
    .from('chapters')
    .select('thesis_id')
    .eq('id', chapterId)
    .single();

  if (!chapter) {
    throw new Error('Chapter not found');
  }

  const storagePath = `theses/${chapter.thesis_id}/chapters/${chapterId}/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(storagePath, fileBuffer, {
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      upsert: false
    });

  if (uploadError) {
    throw new Error(`Failed to upload file: ${uploadError.message}`);
  }

  // Cria versão usando função do banco
  const { data, error } = await supabase.rpc('create_chapter_version', {
    p_chapter_id: chapterId,
    p_file_path: storagePath,
    p_parent_version_id: parentVersionId,
    p_created_by_operation: operation,
    p_metadata: metadata
  });

  if (error) {
    throw new Error(`Failed to create version: ${error.message}`);
  }

  console.log(`[CHAPTER-OPS] Created new version ${newVersionId} from ${operation}`);
  return data;
}

/**
 * Executa operação de ajuste em um capítulo (com instruções do usuário)
 */
export async function executeAdjustOperation(
  jobId: string,
  chapterId: string,
  versionId: string,
  instructions: string,
  creativity: number,
  provider: AIProvider,
  model: string,
  references: ReferenceInput[] = [],
  useGrounding: boolean = false,
  contextVersionIds: string[] = []
): Promise<string> {
  try {
    console.log(`[CHAPTER-ADJUST] Starting job ${jobId} for version ${versionId}`);
    console.log(`[CHAPTER-ADJUST] Instructions: ${instructions.substring(0, 100)}...`);
    console.log(`[CHAPTER-ADJUST] Creativity: ${creativity}`);

    await updateOperationJob(jobId, { status: 'processing', progress: 10 });

    // Busca versão atual
    const { data: version, error: versionError } = await supabase
      .from('chapter_versions')
      .select('*')
      .eq('id', versionId)
      .single();

    if (versionError || !version) {
      throw new Error('Version not found');
    }

    // Baixa arquivo do Storage
    const { data: fileBlob, error: downloadError } = await supabase.storage
      .from('documents')
      .download(version.file_path);

    if (downloadError || !fileBlob) {
      throw new Error(`Failed to download file: ${downloadError?.message}`);
    }

    const tempDir = os.tmpdir();
    const sourcePath = path.join(tempDir, `${jobId}_${versionId}_source.docx`);
    const buffer = Buffer.from(await fileBlob.arrayBuffer());
    await fs.writeFile(sourcePath, buffer);

    await updateOperationJob(jobId, { progress: 20 });

    // Process references if provided
    let referencesContext = '';
    if (references && references.length > 0) {
      console.log(`[CHAPTER-ADJUST] Processing ${references.length} references...`);
      const processedRefs = await processReferences(references);
      referencesContext = formatReferencesForContext(processedRefs);
      console.log(`[CHAPTER-ADJUST] References processed, context length: ${referencesContext.length} chars`);
    }

    // Build chapter context if provided
    const { context: chapterContext, summary: contextSummary } = await buildChapterContextForOperation(contextVersionIds);

    // Combine all contexts and add to instructions
    const combinedContext = referencesContext + chapterContext;
    const enhancedInstructions = combinedContext
      ? `${instructions}\n\nREFERENCE MATERIALS:\n${combinedContext}`
      : instructions;

    // Executa análise de ajustes
    console.log(`[CHAPTER-ADJUST] Analyzing document with instructions...`);
    const apiKey =
      provider === 'openai'
        ? process.env.OPENAI_API_KEY!
        : provider === 'gemini'
          ? (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)!
          : provider === 'anthropic'
            ? process.env.ANTHROPIC_API_KEY!
            : process.env.GROK_API_KEY!;

    const suggestions = await analyzeDocumentForAdjustments(
      sourcePath,
      enhancedInstructions,
      creativity,
      provider as 'openai' | 'gemini' | 'grok' | 'anthropic',
      model,
      apiKey,
      useGrounding,
      () => throwIfCancelled(jobId)
    );

    await updateOperationJob(jobId, { progress: 70 });

    console.log(`[CHAPTER-ADJUST] Found ${suggestions.length} adjustment suggestions`);

    // Cria nova versão do capítulo
    const newVersionId = await createNewChapterVersion(
      chapterId,
      versionId,
      sourcePath,
      'adjust',
      {
        instructions,
        creativity,
        suggestions,
        contextChapters: contextSummary
      }
    );

    await updateOperationJob(jobId, { progress: 90 });

    // Processa chunks da nova versão
    await processChapterVersion(newVersionId);

    // Limpa arquivo temporário
    try {
      await fs.unlink(sourcePath);
    } catch {}

    // Atualiza job com status completo E sugestões no metadata
    const { error: updateError } = await supabase
      .from('chapter_operation_jobs')
      .update({
        status: 'completed',
        progress: 100,
        new_version_id: newVersionId,
        completed_at: new Date().toISOString(),
        metadata: {
          instructions,
          creativity,
          contextChapters: contextSummary,
          suggestions: suggestions.map(s => ({
            id: s.id,
            type: 'adjustment',
            originalText: s.originalText,
            improvedText: s.adjustedText, // Map adjustedText to improvedText
            reason: s.reason,
            confidence: 0.9,
            chapterTitle: s.sectionTitle
          }))
        }
      })
      .eq('id', jobId);

    if (updateError) {
      console.error('[CHAPTER-ADJUST] Failed to update job metadata:', updateError);
    }

    console.log(`[CHAPTER-ADJUST] Job ${jobId} completed! Created version ${newVersionId}`);
    return newVersionId;

  } catch (error: any) {
    if (await recordCancellationIfApplicable(jobId, error, 'CHAPTER-ADJUST')) {
      return '';
    }
    console.error('[CHAPTER-ADJUST] Error:', error);
    await updateOperationJob(jobId, {
      status: 'error',
      errorMessage: error.message
    });
    throw error;
  }
}

/**
 * Executa operação de adaptação em um capítulo (mudança de estilo/audiência)
 */
export async function executeAdaptOperation(
  jobId: string,
  chapterId: string,
  versionId: string,
  style: 'academic' | 'professional' | 'simplified' | 'custom',
  targetAudience: string | undefined,
  provider: AIProvider,
  model: string,
  references: ReferenceInput[] = [],
  contextVersionIds: string[] = []
): Promise<string> {
  try {
    console.log(`[CHAPTER-ADAPT] Starting job ${jobId} for version ${versionId}`);
    console.log(`[CHAPTER-ADAPT] Style: ${style}, Target audience: ${targetAudience || 'general'}`);

    await updateOperationJob(jobId, { status: 'processing', progress: 10 });

    // Busca versão atual
    const { data: version, error: versionError } = await supabase
      .from('chapter_versions')
      .select('*')
      .eq('id', versionId)
      .single();

    if (versionError || !version) {
      throw new Error('Version not found');
    }

    // Baixa arquivo do Storage
    const { data: fileBlob, error: downloadError } = await supabase.storage
      .from('documents')
      .download(version.file_path);

    if (downloadError || !fileBlob) {
      throw new Error(`Failed to download file: ${downloadError?.message}`);
    }

    const tempDir = os.tmpdir();
    const sourcePath = path.join(tempDir, `${jobId}_${versionId}_source.docx`);
    const buffer = Buffer.from(await fileBlob.arrayBuffer());
    await fs.writeFile(sourcePath, buffer);

    await updateOperationJob(jobId, { progress: 20 });

    // Process references (if any)
    let referenceContext = '';
    if (references.length > 0) {
      console.log(`[CHAPTER-ADAPT] Processing ${references.length} references...`);
      referenceContext = await processReferences(references, jobId);
      console.log(`[CHAPTER-ADAPT] Reference context length: ${referenceContext.length} chars`);
    }

    // Build chapter context if provided
    const { context: chapterContext, summary: contextSummary } = await buildChapterContextForOperation(contextVersionIds);

    await updateOperationJob(jobId, { progress: 40 });

    // Get API key for the provider
    const apiKey = getAPIKey(provider);

    // Generate adaptation suggestions
    const { analyzeDocumentForAdaptation } = await import('@/lib/adapt/processor');

    console.log('[CHAPTER-ADAPT] Generating adaptation suggestions...');
    const suggestions = await analyzeDocumentForAdaptation(
      sourcePath,
      style,
      targetAudience,
      provider as 'openai' | 'gemini' | 'grok' | 'anthropic',
      model,
      apiKey,
      undefined, // onProgress
      undefined, // onSavePartial
      () => throwIfCancelled(jobId)
    );

    console.log(`[CHAPTER-ADAPT] Generated ${suggestions.length} suggestions`);

    await updateOperationJob(jobId, { progress: 70 });

    // Create placeholder version (suggestions will be applied when user accepts them)
    const newVersionId = await createNewChapterVersion(
      chapterId,
      versionId,
      sourcePath,
      'adapt',
      {
        style,
        targetAudience,
        suggestionsCount: suggestions.length,
        contextChapters: contextSummary
      }
    );

    await updateOperationJob(jobId, { progress: 85 });

    // Process chunks
    await processChapterVersion(newVersionId);

    await updateOperationJob(jobId, { progress: 95 });

    // Save suggestions to job metadata
    const { error: updateError } = await supabase
      .from('chapter_operation_jobs')
      .update({
        status: 'completed',
        progress: 100,
        new_version_id: newVersionId,
        completed_at: new Date().toISOString(),
        metadata: {
          style,
          targetAudience,
          contextChapters: contextSummary,
          suggestions: suggestions.map(s => ({
            id: s.id,
            type: 'adaptation',
            originalText: s.originalText,
            improvedText: s.adaptedText, // Map adaptedText to improvedText for UI consistency
            reason: s.reason,
            confidence: 0.9,
            chapterTitle: s.sectionTitle,
            adaptationType: s.adaptationType
          }))
        }
      })
      .eq('id', jobId);

    if (updateError) {
      console.error('[CHAPTER-ADAPT] Failed to save metadata:', updateError);
      throw new Error(`Failed to save suggestions: ${updateError.message}`);
    }

    // Clean up
    try {
      await fs.unlink(sourcePath);
    } catch {}

    console.log(`[CHAPTER-ADAPT] Job ${jobId} completed! Created version ${newVersionId}`);
    return newVersionId;

  } catch (error: any) {
    if (await recordCancellationIfApplicable(jobId, error, 'CHAPTER-ADAPT')) {
      return '';
    }
    console.error('[CHAPTER-ADAPT] Error:', error);
    console.error('[CHAPTER-ADAPT] Error stack:', error.stack);
    console.error('[CHAPTER-ADAPT] Error details:', {
      message: error.message,
      name: error.name,
      cause: error.cause,
      jobId,
      chapterId,
      versionId
    });
    await updateOperationJob(jobId, {
      status: 'error',
      errorMessage: error.message || 'Unknown error occurred'
    });
    throw error;
  }
}

/**
 * Executa operação de atualização em um capítulo (usando materiais de referência)
 */
export async function executeUpdateOperation(
  jobId: string,
  chapterId: string,
  versionId: string,
  provider: AIProvider,
  model: string,
  references: ReferenceInput[] = [],
  contextVersionIds: string[] = []
): Promise<string> {
  try {
    console.log(`[CHAPTER-UPDATE] Starting job ${jobId} for version ${versionId}`);
    console.log(`[CHAPTER-UPDATE] References provided: ${references.length}`);

    await updateOperationJob(jobId, { status: 'processing', progress: 10 });

    // Busca versão atual
    const { data: version, error: versionError } = await supabase
      .from('chapter_versions')
      .select('*')
      .eq('id', versionId)
      .single();

    if (versionError || !version) {
      throw new Error('Version not found');
    }

    // Baixa arquivo do Storage
    const { data: fileBlob, error: downloadError } = await supabase.storage
      .from('documents')
      .download(version.file_path);

    if (downloadError || !fileBlob) {
      throw new Error(`Failed to download file: ${downloadError?.message}`);
    }

    const tempDir = os.tmpdir();
    const sourcePath = path.join(tempDir, `${jobId}_${versionId}_source.docx`);
    const buffer = Buffer.from(await fileBlob.arrayBuffer());
    await fs.writeFile(sourcePath, buffer);

    await updateOperationJob(jobId, { progress: 20 });

    // Process references
    let referencesContext = '';
    if (references && references.length > 0) {
      console.log(`[CHAPTER-UPDATE] Processing ${references.length} references...`);
      const processedRefs = await processReferences(references);
      referencesContext = formatReferencesForContext(processedRefs);
      console.log(`[CHAPTER-UPDATE] References processed, context length: ${referencesContext.length} chars`);
    } else {
      console.log(`[CHAPTER-UPDATE] WARNING: No references provided for update operation`);
    }

    // Build chapter context if provided
    const { context: chapterContext, summary: contextSummary } = await buildChapterContextForOperation(contextVersionIds);

    // Combine all contexts
    const combinedContext = referencesContext + chapterContext;

    await updateOperationJob(jobId, { progress: 40 });

    // Extrai estrutura do documento
    console.log(`[CHAPTER-UPDATE] Extracting structure...`);
    const { structure, paragraphs } = await extractDocumentStructure(sourcePath);

    await updateOperationJob(jobId, { progress: 50 });

    // Gera contexto global com referências
    console.log(`[CHAPTER-UPDATE] Generating global context with references...`);
    const apiKey =
      provider === 'openai'
        ? process.env.OPENAI_API_KEY!
        : provider === 'anthropic'
          ? process.env.ANTHROPIC_API_KEY!
          : provider === 'grok'
            ? process.env.GROK_API_KEY!
            : (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)!;

    const updateContextProvider: 'openai' | 'gemini' | 'anthropic' =
      provider === 'anthropic' ? 'anthropic' : provider === 'openai' ? 'openai' : 'gemini';

    const globalContext = await generateGlobalContext(
      paragraphs,
      structure,
      updateContextProvider,
      model,
      apiKey,
      combinedContext
    );

    await updateOperationJob(jobId, { progress: 60 });

    // Analyze document against references and suggest updates
    console.log(`[CHAPTER-UPDATE] Analyzing document against reference materials...`);

    const allSuggestions: any[] = [];
    for (let i = 0; i < structure.sections.length; i++) {
      const section = structure.sections[i];
      const sectionParagraphs = paragraphs
        .slice(section.startParagraphIndex, section.endParagraphIndex + 1)
        .filter(p => !p.isHeader)
        .map(p => p.text);

      const suggestions = await analyzeSectionForUpdates(
        sectionParagraphs,
        globalContext,
        section.title,
        section.startParagraphIndex,
        referencesContext,
        provider,
        model,
        apiKey
      );

      allSuggestions.push(...suggestions);

      // Atualiza progresso (60-80%)
      const sectionProgress = 60 + Math.round((i + 1) / structure.sections.length * 20);
      await updateOperationJob(jobId, { progress: sectionProgress });
    }

    await updateOperationJob(jobId, { progress: 80 });

    console.log(`[CHAPTER-UPDATE] Generated ${allSuggestions.length} update suggestions`);

    // Cria nova versão do capítulo (placeholder, suggestions will be applied when user accepts them)
    const newVersionId = await createNewChapterVersion(
      chapterId,
      versionId,
      sourcePath,
      'update',
      {
        referencesCount: references.length,
        suggestionsCount: allSuggestions.length,
        contextChapters: contextSummary
      }
    );

    await updateOperationJob(jobId, { progress: 85 });

    // Processa chunks
    await processChapterVersion(newVersionId);

    await updateOperationJob(jobId, { progress: 95 });

    // Save suggestions to job metadata
    const { error: updateError } = await supabase
      .from('chapter_operation_jobs')
      .update({
        status: 'completed',
        progress: 100,
        new_version_id: newVersionId,
        completed_at: new Date().toISOString(),
        metadata: {
          referencesCount: references.length,
          contextChapters: contextSummary,
          suggestions: allSuggestions.map((s: any) => ({
            id: s.id,
            type: 'update',
            originalText: s.originalText || '',
            improvedText: s.improvedText || '',
            reason: s.reason || '',
            confidence: s.confidence || 0.9,
            chapterTitle: s.sectionTitle || s.chapterTitle || '',
            referenceSource: s.referenceSource || ''
          }))
        }
      })
      .eq('id', jobId);

    if (updateError) {
      console.error('[CHAPTER-UPDATE] Failed to save metadata:', updateError);
      throw new Error(`Failed to save suggestions: ${updateError.message}`);
    }

    // Clean up
    try {
      await fs.unlink(sourcePath);
    } catch {}

    console.log(`[CHAPTER-UPDATE] Job ${jobId} completed! Created version ${newVersionId}`);
    return newVersionId;

  } catch (error: any) {
    console.error('[CHAPTER-UPDATE] Error:', error);
    await updateOperationJob(jobId, {
      status: 'error',
      errorMessage: error.message
    });
    throw error;
  }
}

/**
 * Analyze section for updates based on reference materials
 * Compares document content with references and suggests factual updates
 */
async function analyzeSectionForUpdates(
  paragraphs: string[],
  globalContext: any,
  sectionTitle: string,
  paragraphStartIndex: number,
  referencesContext: string,
  provider: 'openai' | 'gemini' | 'grok' | 'anthropic',
  model: string,
  apiKey: string
): Promise<any[]> {
  const fullText = paragraphs.join('\n\n');

  // Format chapter summaries for context
  const chapterContext = globalContext.chapterSummaries && globalContext.chapterSummaries.length > 0
    ? '\n\nESTRUTURA DO DOCUMENTO:\n' + globalContext.chapterSummaries
        .map((ch: any, i: number) => `${i + 1}. ${ch.title}\n   → ${ch.summary}`)
        .join('\n')
    : '';

  const prompt = `Você é um especialista em atualização de documentos acadêmicos. Analise o texto abaixo comparando-o com os materiais de referência fornecidos e sugira atualizações APENAS quando houver informações desatualizadas, novos dados ou melhorias factuais baseadas nas referências.

CONTEXTO DO DOCUMENTO:
- Tema: ${globalContext.theme}
- Objetivo: ${globalContext.objective || 'Não especificado'}
- Seção atual: ${sectionTitle}${chapterContext}

MATERIAIS DE REFERÊNCIA FORNECIDOS:
${referencesContext || 'Nenhum material de referência fornecido.'}

ÁREAS DE ANÁLISE PARA ATUALIZAÇÃO:
1. INFORMAÇÕES DESATUALIZADAS: Dados, estatísticas, leis, normas ou fatos que mudaram desde a escrita original
2. NOVOS DADOS: Informações recentes das referências que devem ser incorporadas
3. PRECISÃO FACTUAL: Correções de informações incorretas ou imprecisas baseadas nas referências
4. COMPLETUDE: Informações importantes das referências que estão faltando no documento
5. ALINHAMENTO COM REFERÊNCIAS: Ajustes para alinhar com padrões, normas ou diretrizes das referências

REGRAS IMPORTANTES:
❌ NÃO sugira mudanças apenas por estilo ou preferência pessoal
❌ NÃO altere informações que estão corretas e atualizadas
❌ NÃO sugira melhorias gerais de escrita (isso é função de "improve")
✅ APENAS sugira atualizações FACTUAIS baseadas nas referências fornecidas
✅ Foque em informações que mudaram ou precisam ser atualizadas
✅ Cite qual referência suporta cada atualização sugerida
✅ Mantenha o tom acadêmico e formal

TEXTO PARA ANÁLISE:
---
${fullText}
---

Para cada atualização sugerida, retorne JSON no formato:
{
  "suggestions": [
    {
      "paragraphIndex": 0,
      "originalText": "texto original exato da frase ou trecho (mínimo 30 caracteres)",
      "improvedText": "texto atualizado baseado nas referências",
      "reason": "explicação clara do motivo da atualização e qual referência suporta (1-2 frases)",
      "type": "factual_update|new_data|outdated_info|completeness|alignment",
      "confidence": 0.95,
      "referenceSource": "breve indicação da referência que suporta esta atualização"
    }
  ]
}

IMPORTANTE:
- "paragraphIndex" deve ser 0 para o primeiro parágrafo da seção, 1 para o segundo, etc
- "originalText" deve ser um trecho COMPLETO e EXATO do texto (mínimo 30 caracteres)
- "referenceSource" deve indicar qual referência ou parte dela suporta a atualização
- Se não houver atualizações necessárias baseadas nas referências, retorne: {"suggestions": []}
- Confidence: 1.0 = certeza absoluta baseada em referência clara, 0.7 = sugestão moderada
- Foque em 3-8 atualizações mais importantes (não precisa sugerir tudo)
- Se não houver referências fornecidas, retorne: {"suggestions": []}

Retorne APENAS o JSON, sem texto adicional.`;

  let response: string = '{"suggestions":[]}';

  try {
    if (provider === 'openai' || provider === 'grok') {
      const OpenAI = (await import('openai')).default;
      const client = new OpenAI({
        apiKey,
        baseURL: provider === 'grok' ? 'https://api.x.ai/v1' : undefined
      });

      const completion = await client.chat.completions.create({
        model,
        messages: [{ role: 'user', content: prompt }],
        ...(provider === 'grok' || !isOpenAIGpt5Family(model) ? { temperature: 0.3 } : {}),
        max_tokens: 12000, // Aumentado para permitir atualizações muito detalhadas
        response_format: { type: 'json_object' }
      });

      response = completion.choices[0]?.message?.content?.trim() || '{"suggestions":[]}';
    } else if (provider === 'anthropic') {
      const { anthropicChat } = await import('@/lib/ai/anthropic');
      const { text } = await anthropicChat({
        apiKey,
        model,
        system:
          'Responda apenas com um objeto JSON válido conforme o formato pedido. Sem markdown.',
        user: prompt,
        maxTokens: 12000,
        temperature: 0.3
      });
      response = text || '{"suggestions":[]}';
    } else {
      // Gemini with 429 retry
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(apiKey);
      const geminiModel = genAI.getGenerativeModel({
        model,
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 8192,
          responseMimeType: 'application/json'
        }
      });
      const maxRetries = 4;
      let lastErr: any;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const result = await geminiModel.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }]
          });
          response = result.response.text();
          lastErr = undefined;
          break;
        } catch (err: any) {
          lastErr = err;
          if (isGemini429(err) && attempt < maxRetries) {
            const delayMs = parseGeminiRetryDelayMs(err);
            console.warn(`[UPDATE] Gemini 429 (tentativa ${attempt}/${maxRetries}), aguardando ${(delayMs / 1000).toFixed(1)}s...`);
            await sleep(delayMs);
          } else {
            throw err;
          }
        }
      }
      if (lastErr) throw lastErr;
    }

    // Parse response
    const data = JSON.parse(response);
    const suggestions: any[] = (data.suggestions || []).map((s: any) => ({
      id: randomUUID(),
      paragraphIndex: paragraphStartIndex + (s.paragraphIndex || 0),
      sectionTitle,
      originalText: s.originalText || '',
      improvedText: s.improvedText || '',
      reason: s.reason || '',
      type: s.type || 'factual_update',
      confidence: s.confidence || 0.9,
      referenceSource: s.referenceSource || 'Referência fornecida'
    }));

    return suggestions;

  } catch (error: any) {
    console.error('[UPDATE] Failed to parse AI response:', error);
    if (response) {
      console.error('[UPDATE] Response was:', response.substring(0, 500));
    }
    return [];
  }
}

/**
 * Generate translation suggestions for a batch of paragraphs
 */
async function generateTranslationSuggestions(
  paragraphs: Array<{ text: string; index: number }>,
  sectionTitle: string,
  targetLanguage: string,
  sourceLanguage: string | undefined,
  provider: 'openai' | 'gemini' | 'grok' | 'anthropic',
  model: string,
  apiKey: string
): Promise<any[]> {
  const prompt = `You are a professional translator. Translate the following text ${sourceLanguage ? `from ${sourceLanguage}` : ''} to ${targetLanguage}.

For each paragraph, provide:
- originalText: the exact original text (unchanged)
- translatedText: the professional translation in ${targetLanguage}

Maintain the same tone, style, and technical accuracy. Preserve formatting, numbers, and technical terms appropriately.

Paragraphs to translate:
${paragraphs.map((p, i) => `[${i + 1}] ${p.text}`).join('\n\n')}

Respond with ONLY a JSON object in this format:
{
  "translations": [
    {
      "originalText": "...",
      "translatedText": "..."
    }
  ]
}`;

  let responseText = '';

  if (provider === 'openai' || provider === 'grok') {
    const OpenAI = (await import('openai')).default;
    const client = new OpenAI({
      apiKey,
      baseURL: provider === 'grok' ? 'https://api.x.ai/v1' : undefined
    });

    const response = await client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      ...(provider === 'grok' || !isOpenAIGpt5Family(model) ? { temperature: 0.3 } : {}),
      response_format: { type: 'json_object' }
    });

    responseText = response.choices[0].message.content || '{}';

  } else if (provider === 'anthropic') {
    const { anthropicChat } = await import('@/lib/ai/anthropic');
    const { text } = await anthropicChat({
      apiKey,
      model,
      system:
        'Responda apenas com um objeto JSON válido conforme o formato pedido. Sem markdown.',
      user: prompt,
      maxTokens: 12000,
      temperature: 0.3
    });
    responseText = text || '{}';
  } else {
    // Gemini with 429 retry
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const geminiModel = genAI.getGenerativeModel({ model });
    const maxRetries = 4;
    let lastErr: any;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await geminiModel.generateContent({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,
            responseMimeType: 'application/json'
          }
        });
        responseText = result.response.text();
        lastErr = undefined;
        break;
      } catch (err: any) {
        lastErr = err;
        if (isGemini429(err) && attempt < maxRetries) {
          const delayMs = parseGeminiRetryDelayMs(err);
          console.warn(`[TRANSLATE] Gemini 429 (tentativa ${attempt}/${maxRetries}), aguardando ${(delayMs / 1000).toFixed(1)}s...`);
          await sleep(delayMs);
        } else {
          throw err;
        }
      }
    }
    if (lastErr) throw lastErr;
  }

  // Parse response
  try {
    const { randomUUID } = await import('crypto');
    const data = JSON.parse(responseText);
    const translations: any[] = (data.translations || []).map((t: any) => ({
      id: randomUUID(),
      originalText: t.originalText || '',
      translatedText: t.translatedText || '',
      sectionTitle
    }));

    return translations;
  } catch (error) {
    console.error('[TRANSLATE] Failed to parse AI response:', error);
    return [];
  }
}

/**
 * Get API key for the specified provider
 */
function getAPIKey(provider: AIProvider): string {
  switch (provider) {
    case 'openai':
      return process.env.OPENAI_API_KEY!;
    case 'gemini':
      return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY!;
    case 'grok':
      return process.env.GROK_API_KEY!;
    case 'anthropic':
      return process.env.ANTHROPIC_API_KEY!;
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

/**
 * Build context from other chapter versions for operation prompts
 * Loads chapter chunks and formats them as readable context
 */
async function buildChapterContextForOperation(
  contextVersionIds: string[]
): Promise<{ context: string; summary: OperationContextSummary[] }> {
  if (!contextVersionIds || contextVersionIds.length === 0) {
    return { context: '', summary: [] };
  }

  console.log(`[CHAPTER-CONTEXT] Building context from ${contextVersionIds.length} chapter versions`);

  // Fetch version metadata and chunks
  const { data: versionsData, error } = await supabase
    .from('chapter_versions')
    .select(`
      id,
      version_number,
      chapters:chapter_id (
        id,
        title,
        chapter_order
      )
    `)
    .in('id', contextVersionIds);

  if (error || !versionsData) {
    console.error('[CHAPTER-CONTEXT] Error fetching versions:', error);
    return { context: '', summary: [] };
  }

  // Build summary for metadata
  const summary: OperationContextSummary[] = versionsData.map((v: any) => {
    const chapter = Array.isArray(v.chapters) ? v.chapters[0] : v.chapters;
    return {
      chapter_id: chapter.id,
      chapter_title: chapter.title,
      chapter_order: chapter.chapter_order,
      version_id: v.id,
      version_number: v.version_number
    };
  });

  // Fetch chunks for each version
  const contextParts: string[] = [];

  for (const versionData of versionsData) {
    const chapter = Array.isArray(versionData.chapters) ? versionData.chapters[0] : versionData.chapters;

    // Fetch chunks for this version
    const { data: chunks, error: chunksError } = await supabase
      .from('chapter_chunks')
      .select('text, page_from, page_to')
      .eq('chapter_version_id', versionData.id)
      .order('chunk_index');

    if (chunksError || !chunks || chunks.length === 0) {
      console.warn(`[CHAPTER-CONTEXT] No chunks found for version ${versionData.id}`);
      continue;
    }

    // Format chunks into readable text
    const chunkTexts = chunks.map((c: any) => c.text).join('\n\n');
    const contextHeader = `\n\n=== CAPÍTULO ${chapter.chapter_order}: ${chapter.title} (Versão ${versionData.version_number}) ===\n\n`;
    contextParts.push(contextHeader + chunkTexts);
  }

  const fullContext = contextParts.length > 0
    ? `\n\nCONTEXTO DE CAPÍTULOS RELACIONADOS:\n${contextParts.join('\n\n')}`
    : '';

  console.log(`[CHAPTER-CONTEXT] Built context: ${fullContext.length} characters from ${summary.length} chapters`);

  return { context: fullContext, summary };
}
