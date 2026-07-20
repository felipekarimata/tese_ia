import { supabase } from '@/lib/supabase';
import { parseDocument } from '@/lib/parsers';
import { chunkText } from '@/lib/chunking';
import { buildIndex, state } from '@/lib/state';

type PersistDocumentVersionParams = {
  documentId: string;
  title: string;
  projectId?: string | null;
  buffer: Buffer;
  operation: string;
};

export async function persistDocumentVersion({
  documentId,
  title,
  projectId,
  buffer,
  operation,
}: PersistDocumentVersionParams): Promise<{ filePath: string; pages: number; chunksCount: number }> {
  const safeOperation = operation.replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
  const filePath = `documents/${documentId}/versions/${Date.now()}_${safeOperation}.docx`;

  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(filePath, buffer, {
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`Failed to upload document version: ${uploadError.message}`);
  }

  const parseName = /\.[a-z0-9]+$/i.test(title) ? title : `${title}.docx`;
  const { text, pages } = await parseDocument(buffer, parseName);
  const chunks = chunkText(text, pages);

  const { error: updateError } = await supabase
    .from('documents')
    .update({
      file_path: filePath,
      pages,
      chunks_count: chunks.length,
      updated_at: new Date().toISOString(),
    })
    .eq('id', documentId);

  if (updateError) {
    throw new Error(`Failed to update document version: ${updateError.message}`);
  }

  state.docs.set(documentId, {
    id: documentId,
    title,
    pages,
    pathTmp: filePath,
    chunks,
    index: buildIndex(chunks),
    projectId: projectId || undefined,
  });

  if (projectId) {
    await supabase
      .from('projects')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', projectId);
  }

  return { filePath, pages, chunksCount: chunks.length };
}
