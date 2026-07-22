/**
 * Unified document transform runner respecting global send mode.
 */

import {
  processWholeDocument,
  type WholeDocumentOptions,
  type WholeDocumentResult,
} from './whole-document';
import {
  getDocumentSendMode,
  getDocumentProcessingSettings,
  shouldFallbackToBatches,
  forceBatchesOnly,
  forceWholeOnly,
} from './mode';
import { isQuotaExhausted } from '@/lib/ai-error-message';

export type TransformRunResult = {
  wholeResult?: WholeDocumentResult;
  usedWhole: boolean;
  processingMode: 'whole-document' | 'batches' | 'rag';
  /** When whole failed and batches should run. */
  runBatches: boolean;
  wholeError?: string;
};

export async function runTransformWithMode(
  inputPath: string,
  outputPath: string,
  wholeOptions: WholeDocumentOptions
): Promise<TransformRunResult> {
  const mode = getDocumentSendMode();

  if (forceBatchesOnly()) {
    return {
      usedWhole: false,
      processingMode: mode === 'rag' ? 'rag' : 'batches',
      runBatches: true,
    };
  }

  const settings = getDocumentProcessingSettings();
  const whole = await processWholeDocument(inputPath, outputPath, {
    ...wholeOptions,
    maxChars: wholeOptions.maxChars ?? settings.maxWholeDocumentChars,
  });

  if (whole.success) {
    return {
      wholeResult: whole,
      usedWhole: true,
      processingMode: 'whole-document',
      runBatches: false,
    };
  }

  const err = whole.error || 'Whole-document processing failed';

  if (isQuotaExhausted(err)) {
    throw new Error(err);
  }

  if (forceWholeOnly()) {
    throw new Error(err);
  }

  if (!shouldFallbackToBatches() && !err.includes('size limit')) {
    throw new Error(err);
  }

  return {
    wholeResult: whole,
    usedWhole: false,
    processingMode: 'batches',
    runBatches: true,
    wholeError: err,
  };
}
