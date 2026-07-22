import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { supabase } from '@/lib/supabase';
import { AIProvider } from '@/lib/ai/types';
import { analyzeDocumentForAdjustments } from '@/lib/adjust/processor';
import { analyzeDocumentForAdaptation } from '@/lib/adapt/processor';
import { translateDocx, applySuggestionsToDocx, type ApplyDocxSuggestion } from '@/lib/translation/docx-translator';
import { SupportedLanguage } from '@/lib/translation/types';
import { runTransformWithMode } from '@/lib/document-processing/run-transform';
import type { WholeDocumentTask } from '@/lib/document-processing/whole-document';
import {
  createOperationJob,
  updateOperationJob,
  type ChapterOperation,
} from '@/lib/thesis/chapter-operations';
import {
  downloadChapterVersionFile,
  createChapterVersionFromFile,
  getApiKey,
} from '@/lib/multi-ai/chapter-helpers';
import { persistDocumentVersion } from '@/lib/document-versioning';
import type { CustomSkillWholeDocumentAction } from '@/lib/agent/skill-dispatch';
import type { SkillOperation } from '@/lib/skills/types';

function mapOperationToTask(operation: SkillOperation): WholeDocumentTask {
  if (operation === 'translate') return 'translate';
  if (operation === 'adapt') return 'adapt';
  return 'adjust';
}

function mapOperationToChapterOp(operation: SkillOperation): ChapterOperation {
  if (operation === 'translate') return 'translate';
  if (operation === 'adapt') return 'adapt';
  return 'adjust';
}

async function runWholeDocumentWithFallback(
  inputPath: string,
  outputPath: string,
  action: CustomSkillWholeDocumentAction,
  provider: AIProvider,
  model: string
): Promise<{ processingMode: string }> {
  const task = mapOperationToTask(action.operation);

  const transform = await runTransformWithMode(inputPath, outputPath, {
    task,
    provider,
    model,
    customPrompt: action.prompt,
    adjustInstructions: action.prompt,
    adaptStyle: action.adaptStyle,
    targetAudience: action.targetAudience,
    targetLanguage: action.targetLanguage,
  });

  if (transform.usedWhole) {
    return { processingMode: transform.processingMode };
  }

  if (!transform.runBatches) {
    throw new Error(transform.wholeError || 'Falha ao processar o documento inteiro');
  }

  const apiKey = getApiKey(provider);

  if (action.operation === 'translate' && action.targetLanguage) {
    const result = await translateDocx(inputPath, outputPath, {
      targetLanguage: action.targetLanguage,
      provider,
      model,
    });
    if (!result.success) {
      throw new Error(result.error || 'Falha na tradução');
    }
    return { processingMode: transform.processingMode };
  }

  if (action.operation === 'adapt') {
    const suggestions = await analyzeDocumentForAdaptation(
      inputPath,
      action.adaptStyle || 'custom',
      action.targetAudience,
      provider,
      model,
      apiKey
    );
    if (suggestions.length === 0) {
      await fs.copyFile(inputPath, outputPath);
    } else {
      const docxSuggestions: ApplyDocxSuggestion[] = suggestions.map((s: any) => ({
        id: s.id,
        originalText: s.originalText || '',
        improvedText: s.adaptedText || '',
      }));
      await applySuggestionsToDocx(inputPath, outputPath, docxSuggestions);
    }
    return { processingMode: transform.processingMode };
  }

  const suggestions = await analyzeDocumentForAdjustments(
    inputPath,
    action.prompt,
    5,
    provider,
    model,
    apiKey,
    false
  );
  if (suggestions.length === 0) {
    await fs.copyFile(inputPath, outputPath);
  } else {
    const docxSuggestions: ApplyDocxSuggestion[] = suggestions.map((s: any) => ({
      id: s.id,
      originalText: s.originalText || '',
      improvedText: s.adjustedText || s.improvedText || '',
    }));
    await applySuggestionsToDocx(inputPath, outputPath, docxSuggestions);
  }
  return { processingMode: transform.processingMode };
}

export async function startChapterCustomSkillJob(
  chapterId: string,
  versionId: string,
  action: CustomSkillWholeDocumentAction
): Promise<string> {
  const chapterOp = mapOperationToChapterOp(action.operation);
  return createOperationJob(chapterId, versionId, chapterOp);
}

export async function executeChapterCustomSkill(
  jobId: string,
  chapterId: string,
  versionId: string,
  action: CustomSkillWholeDocumentAction,
  provider: AIProvider,
  model: string
): Promise<string> {
  const chapterOp = mapOperationToChapterOp(action.operation);

  try {
    await updateOperationJob(jobId, { status: 'processing', progress: 10 });

    const { data: version, error: versionError } = await supabase
      .from('chapter_versions')
      .select('file_path')
      .eq('id', versionId)
      .single();

    if (versionError || !version) {
      throw new Error('Versão não encontrada');
    }

    const inputPath = await downloadChapterVersionFile(versionId, version.file_path, 'custom_skill');
    const outputPath = path.join(os.tmpdir(), `${jobId}_custom_skill.docx`);

    await updateOperationJob(jobId, { progress: 25 });

    const { processingMode } = await runWholeDocumentWithFallback(
      inputPath,
      outputPath,
      action,
      provider,
      model
    );

    await updateOperationJob(jobId, { progress: 85 });

    const newVersionId = await createChapterVersionFromFile(
      chapterId,
      versionId,
      outputPath,
      chapterOp as 'translate' | 'adapt' | 'adjust' | 'update',
      {
        customSkill: action.command,
        prompt: action.prompt.slice(0, 2000),
        processingMode,
        wholeDocument: true,
      },
      true
    );

    await updateOperationJob(jobId, {
      status: 'completed',
      progress: 100,
      newVersionId,
      completedAt: new Date().toISOString(),
    });

    await supabase
      .from('chapter_operation_jobs')
      .update({
        metadata: {
          customSkill: action.command,
          prompt: action.prompt.slice(0, 2000),
          processingMode,
          wholeDocument: true,
        },
      })
      .eq('id', jobId);

    await fs.unlink(inputPath).catch(() => {});
    await fs.unlink(outputPath).catch(() => {});

    return newVersionId;
  } catch (error: any) {
    await updateOperationJob(jobId, {
      status: 'error',
      errorMessage: error.message,
    });
    throw error;
  }
}

export async function executeDocumentCustomSkill(
  documentId: string,
  doc: { title: string; file_path: string; project_id?: string | null },
  adjustJobId: string,
  action: CustomSkillWholeDocumentAction,
  provider: AIProvider,
  model: string
): Promise<void> {
  const inputPath = path.join(os.tmpdir(), `${adjustJobId}_custom_skill_in.docx`);
  const outputPath = path.join(os.tmpdir(), `${adjustJobId}_custom_skill_out.docx`);

  try {
    await supabase
      .from('adjust_jobs')
      .update({ status: 'processing', started_at: new Date().toISOString() })
      .eq('id', adjustJobId);

    const { data: fileBlob, error: downloadError } = await supabase.storage
      .from('documents')
      .download(doc.file_path);

    if (downloadError || !fileBlob) {
      throw new Error(`Falha ao baixar documento: ${downloadError?.message}`);
    }

    await fs.writeFile(inputPath, Buffer.from(await fileBlob.arrayBuffer()));

    const { processingMode } = await runWholeDocumentWithFallback(
      inputPath,
      outputPath,
      action,
      provider,
      model
    );

    const buffer = await fs.readFile(outputPath);
    const { filePath } = await persistDocumentVersion({
      documentId,
      title: doc.title,
      projectId: doc.project_id,
      buffer,
      operation: action.command.replace(/^\//, '') || 'custom_skill',
    });

    await supabase
      .from('adjust_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        progress_percentage: 100,
        suggestions: [
          {
            id: 'whole-document',
            type: 'whole-document-applied',
            customSkill: action.command,
            processingMode,
            appliedToDocument: true,
            newFilePath: filePath,
          },
        ],
      })
      .eq('id', adjustJobId);
  } catch (error: any) {
    await supabase
      .from('adjust_jobs')
      .update({
        status: 'error',
        error_message: error.message,
        completed_at: new Date().toISOString(),
      })
      .eq('id', adjustJobId);
    throw error;
  } finally {
    await fs.unlink(inputPath).catch(() => {});
    await fs.unlink(outputPath).catch(() => {});
  }
}
