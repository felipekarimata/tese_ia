import { state, buildIndex } from './state';
import { supabase } from './supabase';
import { parseDocument } from './parsers';
import { chunkText } from './chunking';

/**
 * Garante que o documento está carregado em memória.
 * Se não estiver, busca do Supabase Storage e processa.
 */
export async function ensureDocumentInMemory(documentId: string) {
  // Já está em memória? Retorna direto
  if (state.docs.has(documentId)) {
    return state.docs.get(documentId)!;
  }

  console.log(`[DocumentLoader] Loading document ${documentId} from Supabase...`);

  // Busca metadados do banco
  const { data: doc, error: dbError } = await supabase
    .from('documents')
    .select('*')
    .eq('id', documentId)
    .single();

  if (dbError || !doc) {
    throw new Error(`Document ${documentId} not found in database`);
  }

  // Baixa arquivo do Storage
  const { data: fileBuffer, error: storageError } = await supabase.storage
    .from('documents')
    .download(doc.file_path);

  if (storageError || !fileBuffer) {
    throw new Error(`Failed to download document from Storage: ${storageError?.message}`);
  }

  // Converte Blob para Buffer
  const arrayBuffer = await fileBuffer.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Processa documento (parse + chunk + index)
  const { text, pages } = await parseDocument(buffer, doc.title);
  const chunks = chunkText(text, pages);

  // Cria índice BM25 usando função do state.ts
  const index = buildIndex(chunks);

  // Salva em memória
  state.docs.set(documentId, {
    id: documentId,
    title: doc.title,
    pages: doc.pages,
    pathTmp: doc.file_path, // Agora é caminho do Storage
    chunks,
    index,
    projectId: doc.project_id || undefined,
  });

  console.log(`[DocumentLoader] Document ${documentId} loaded: ${chunks.length} chunks`);

  return state.docs.get(documentId)!;
}

/**
 * Remove documento da memória (útil para liberar RAM)
 */
export function unloadDocument(documentId: string) {
  if (state.docs.has(documentId)) {
    console.log(`[DocumentLoader] Unloading document ${documentId} from memory`);
    state.docs.delete(documentId);
  }
}

/**
 * Retorna estatísticas de uso de memória
 */
export function getMemoryStats() {
  let totalChunks = 0;
  let totalDocs = state.docs.size;

  for (const doc of state.docs.values()) {
    totalChunks += doc.chunks.length;
  }

  return {
    documentsInMemory: totalDocs,
    totalChunks,
    estimatedMB: Math.round((totalChunks * 500) / 1024 / 1024), // ~500 chars/chunk
  };
}
