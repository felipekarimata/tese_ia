import { supabase } from '@/lib/supabase';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { processChapterVersion } from '@/lib/thesis/chapter-processor';
import { AIProvider } from '@/lib/ai/types';

export async function downloadChapterVersionFile(
  versionId: string,
  filePath: string,
  label: string
): Promise<string> {
  const { data: fileBlob, error } = await supabase.storage.from('documents').download(filePath);
  if (error || !fileBlob) {
    throw new Error(`Falha ao baixar versão ${versionId}: ${error?.message || 'erro desconhecido'}`);
  }
  const tempPath = path.join(os.tmpdir(), `${versionId}_${label}_${randomUUID()}.docx`);
  await fs.writeFile(tempPath, Buffer.from(await fileBlob.arrayBuffer()));
  return tempPath;
}

export async function createChapterVersionFromFile(
  chapterId: string,
  parentVersionId: string,
  filePath: string,
  operation: 'translate' | 'adapt' | 'update' | 'adjust',
  metadata: Record<string, unknown> = {},
  setAsCurrent = true
): Promise<string> {
  const { data: chapter, error: chapterError } = await supabase
    .from('chapters')
    .select('thesis_id')
    .eq('id', chapterId)
    .single();
  if (chapterError || !chapter) throw new Error('Capítulo não encontrado');

  const versionFileName = `${randomUUID()}.docx`;
  const storagePath = `theses/${chapter.thesis_id}/chapters/${chapterId}/${versionFileName}`;
  const buffer = await fs.readFile(filePath);

  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(storagePath, buffer, {
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      upsert: false,
    });
  if (uploadError) throw new Error(`Falha ao enviar nova versão: ${uploadError.message}`);

  const { data: newVersionId, error: rpcError } = await supabase.rpc('create_chapter_version', {
    p_chapter_id: chapterId,
    p_file_path: storagePath,
    p_parent_version_id: parentVersionId,
    p_created_by_operation: operation,
    p_metadata: metadata,
  });
  if (rpcError) throw new Error(`Falha ao criar nova versão: ${rpcError.message}`);

  await processChapterVersion(newVersionId);

  if (setAsCurrent) {
    await supabase
      .from('chapters')
      .update({ current_version_id: newVersionId, updated_at: new Date().toISOString() })
      .eq('id', chapterId);
  }

  return newVersionId;
}

export async function activateChapterVersion(chapterId: string, versionId: string): Promise<void> {
  const { error } = await supabase
    .from('chapters')
    .update({ current_version_id: versionId, updated_at: new Date().toISOString() })
    .eq('id', chapterId);
  if (error) throw new Error(error.message);
}

export async function syncMulti3ChapterVersionRoles(
  chapterId: string,
  sessionId: string,
  winnerVersionId: string
): Promise<void> {
  const { data: rows, error } = await supabase
    .from('chapter_versions')
    .select('id, metadata')
    .eq('chapter_id', chapterId);

  if (error || !rows) return;

  for (const row of rows) {
    const meta = (row.metadata || {}) as Record<string, unknown>;
    if (meta.multi3SessionId !== sessionId) continue;
    const role = row.id === winnerVersionId ? 'winner' : 'candidate';
    await supabase
      .from('chapter_versions')
      .update({ metadata: { ...meta, multi3Role: role } })
      .eq('id', row.id);
  }
}

export async function getLatestChapterVersion(chapterId: string, preferredVersionId?: string) {
  let query = supabase
    .from('chapter_versions')
    .select('id, file_path, chapter_id, version_number')
    .eq('chapter_id', chapterId);

  if (preferredVersionId) {
    query = query.eq('id', preferredVersionId);
  } else {
    query = query.order('version_number', { ascending: false }).limit(1);
  }

  const { data, error } = await query.single();
  if (error || !data) throw new Error('Versão mais recente não encontrada');
  return data;
}

export function getApiKey(provider: AIProvider): string {
  const apiKey =
    provider === 'openai'
      ? process.env.OPENAI_API_KEY
      : provider === 'anthropic'
        ? process.env.ANTHROPIC_API_KEY
        : provider === 'grok'
          ? process.env.GROK_API_KEY
          : process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

  if (!apiKey) throw new Error(`Chave de API não configurada para ${provider}`);
  return apiKey;
}

export async function extractVersionTextPreview(filePath: string, maxChars = 8000): Promise<string> {
  const { extractDocumentStructure } = await import('@/lib/improvement/document-analyzer');
  const tempPath = filePath;
  const { paragraphs } = await extractDocumentStructure(tempPath);
  const full = paragraphs.map((p) => p.text).join('\n\n');
  return full.length > maxChars ? full.slice(0, maxChars) + '…' : full;
}
