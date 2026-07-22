/**
 * Global document send mode — how document content is sent to the AI.
 */

import { state } from '@/lib/state';

export type DocumentSendMode =
  | 'auto'
  | 'whole-document'
  | 'batches'
  | 'rag'
  | 'full-context';

export type DocumentProcessingSettings = {
  mode: DocumentSendMode;
  maxWholeDocumentChars?: number;
  ragTopK?: number;
  fullContextMaxChars?: number;
};

export const DOCUMENT_SEND_MODE_LABELS: Record<DocumentSendMode, string> = {
  auto: 'Automático (documento inteiro, fallback em lotes)',
  'whole-document': 'Documento inteiro (marcadores de parágrafo)',
  batches: 'Somente em partes (lotes)',
  rag: 'RAG (trechos relevantes por busca)',
  'full-context': 'Prompt + documento completo',
};

export const DEFAULT_DOCUMENT_PROCESSING: DocumentProcessingSettings = {
  mode: 'auto',
  maxWholeDocumentChars: 96000,
  ragTopK: 12,
  fullContextMaxChars: 120000,
};

export function getDocumentProcessingSettings(): DocumentProcessingSettings {
  const raw = state.settings.documentProcessing;
  if (!raw) return { ...DEFAULT_DOCUMENT_PROCESSING };
  return {
    ...DEFAULT_DOCUMENT_PROCESSING,
    ...raw,
    mode: raw.mode || DEFAULT_DOCUMENT_PROCESSING.mode,
  };
}

export function getDocumentSendMode(): DocumentSendMode {
  return getDocumentProcessingSettings().mode;
}

/** Transform ops: whole-document, batches, or auto (try whole then batches). RAG uses batches. */
export type TransformStrategy = 'whole' | 'batches';

export function resolveTransformStrategy(): TransformStrategy {
  const mode = getDocumentSendMode();
  switch (mode) {
    case 'whole-document':
    case 'full-context':
      return 'whole';
    case 'batches':
    case 'rag':
      return 'batches';
    case 'auto':
    default:
      return 'whole'; // caller tries whole first, may fallback if auto
  }
}

export function shouldFallbackToBatches(): boolean {
  const mode = getDocumentSendMode();
  return mode === 'auto';
}

export function forceBatchesOnly(): boolean {
  return getDocumentSendMode() === 'batches' || getDocumentSendMode() === 'rag';
}

export function forceWholeOnly(): boolean {
  const mode = getDocumentSendMode();
  return mode === 'whole-document' || mode === 'full-context';
}
