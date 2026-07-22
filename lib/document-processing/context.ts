/**
 * Build document context for chat / perguntar based on global send mode.
 */

import { state, searchIndex } from '@/lib/state';
import { loadChapterVersion, searchChapterVersion } from '@/lib/thesis/chapter-processor';
import {
  getDocumentProcessingSettings,
  type DocumentSendMode,
} from './mode';

export type DocumentContextInput = {
  /** Full plain text of the document (when available). */
  documentText?: string;
  documentTitle?: string;
  /** Chapter version for RAG (chapters agent). */
  versionId?: string;
  /** Project document id for RAG (in-memory docs). */
  documentId?: string;
  /** User query — required for RAG mode. */
  query: string;
  /** Override mode (defaults to settings). */
  mode?: DocumentSendMode;
};

export type DocumentContextResult = {
  text: string;
  modeUsed: DocumentSendMode | 'truncated';
  truncated: boolean;
  chunkCount?: number;
};

function truncateText(text: string, maxChars: number): { text: string; truncated: boolean } {
  if (text.length <= maxChars) return { text, truncated: false };
  return {
    text:
      text.slice(0, maxChars) +
      '\n\n[...documento truncado — use modo RAG ou documento menor para contexto completo...]',
    truncated: true,
  };
}

function formatRagChunks(
  chunks: Array<{ text: string; page_from?: number; page_to?: number; pageFrom?: number; pageTo?: number }>
): string {
  if (chunks.length === 0) {
    return '[Nenhum trecho relevante encontrado via RAG.]';
  }
  return chunks
    .map((c, i) => {
      const pf = c.page_from ?? c.pageFrom;
      const pt = c.page_to ?? c.pageTo;
      const pages =
        pf != null ? ` (pág. ${pf}${pt != null && pt !== pf ? `–${pt}` : ''})` : '';
      return `--- Trecho ${i + 1}${pages} ---\n${c.text}`;
    })
    .join('\n\n');
}

async function buildRagContext(input: DocumentContextInput, topK: number): Promise<DocumentContextResult> {
  const query = input.query.trim() || input.documentTitle || 'documento';

  if (input.versionId) {
    try {
      const version = await loadChapterVersion(input.versionId, state);
      const chunks = searchChapterVersion(version, query, topK);
      return {
        text: formatRagChunks(chunks),
        modeUsed: 'rag',
        truncated: false,
        chunkCount: chunks.length,
      };
    } catch (e) {
      console.warn('[DOC-CONTEXT] RAG chapter failed, falling back to full text:', e);
    }
  }

  if (input.documentId && state.docs.has(input.documentId)) {
    const doc = state.docs.get(input.documentId)!;
    const chunks = searchIndex(doc.index, doc.chunks, query, topK);
    return {
      text: formatRagChunks(chunks),
      modeUsed: 'rag',
      truncated: false,
      chunkCount: chunks.length,
    };
  }

  // Fallback: first portion of full text
  const fallback = input.documentText || '';
  const { text, truncated } = truncateText(fallback, 60000);
  return { text, modeUsed: 'truncated', truncated, chunkCount: 0 };
}

/**
 * Resolve document body to inject into prompts (chat, /perguntar, etc.).
 */
export async function buildDocumentContext(
  input: DocumentContextInput
): Promise<DocumentContextResult> {
  const settings = getDocumentProcessingSettings();
  const mode = input.mode ?? settings.mode;
  const fullText = input.documentText || '';

  switch (mode) {
    case 'rag': {
      return buildRagContext(input, settings.ragTopK ?? 12);
    }

    case 'full-context': {
      const max = settings.fullContextMaxChars ?? 120000;
      const { text, truncated } = truncateText(fullText, max);
      return { text, modeUsed: 'full-context', truncated };
    }

    case 'whole-document':
    case 'auto':
    case 'batches':
    default: {
      const max = mode === 'batches' ? 60000 : settings.fullContextMaxChars ?? 60000;
      const { text, truncated } = truncateText(fullText, max);
      return { text, modeUsed: truncated ? 'truncated' : mode, truncated };
    }
  }
}
