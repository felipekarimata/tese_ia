import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';
import { applySuggestionsToDocx, type ApplyDocxSuggestion } from '@/lib/translation/docx-translator';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; jobId: string }> }
) {
  try {
    const { id: chapterId, jobId } = await params;
    const body = await req.json();
    const { acceptedSuggestionIds } = body;

    console.log(`[APPLY-API] Applying ${acceptedSuggestionIds.length} suggestions for job: ${jobId}`);

    if (!acceptedSuggestionIds || acceptedSuggestionIds.length === 0) {
      return NextResponse.json(
        { error: 'No suggestions selected' },
        { status: 400 }
      );
    }

    // Busca job
    const { data: job, error: jobError } = await supabase
      .from('chapter_operation_jobs')
      .select('*')
      .eq('id', jobId)
      .eq('chapter_id', chapterId)
      .single();

    if (jobError || !job) {
      console.error('[APPLY-API] Job not found:', jobError);
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    if (job.status !== 'completed') {
      return NextResponse.json(
        { error: 'Job not completed yet' },
        { status: 400 }
      );
    }

    // Busca versão original
    const { data: version, error: versionError } = await supabase
      .from('chapter_versions')
      .select('*')
      .eq('id', job.version_id)
      .single();

    if (versionError || !version) {
      console.error('[APPLY-API] Version not found:', versionError);
      return NextResponse.json(
        { error: 'Version not found' },
        { status: 404 }
      );
    }

    // Baixa arquivo original
    const { data: fileBlob, error: downloadError } = await supabase.storage
      .from('documents')
      .download(version.file_path);

    if (downloadError || !fileBlob) {
      console.error('[APPLY-API] Download error:', downloadError);
      return NextResponse.json(
        { error: 'Failed to download original file' },
        { status: 500 }
      );
    }

    // Salva arquivo temporário
    const tempDir = os.tmpdir();
    const sourcePath = path.join(tempDir, `${jobId}_${job.version_id}_source.docx`);
    const outputPath = path.join(tempDir, `${randomUUID()}_output.docx`);
    const buffer = Buffer.from(await fileBlob.arrayBuffer());
    await fs.writeFile(sourcePath, buffer);

    // Extrai sugestões aceitas do metadata
    const metadata = job.metadata || {};
    const allSuggestions = metadata.suggestions || [];
    const acceptedSuggestions = allSuggestions.filter((s: any) =>
      acceptedSuggestionIds.includes(s.id)
    );

    console.log(`[APPLY-API] Applying ${acceptedSuggestions.length} accepted suggestions`);

    // Aplica as sugestões no DOCX (substitui originalText -> improvedText)
    const suggestionsForDocx: ApplyDocxSuggestion[] = acceptedSuggestions.map((s: any) => ({
      id: s.id,
      originalText: s.originalText || '',
      improvedText: s.improvedText || ''
    }));

    const applyResult = await applySuggestionsToDocx(sourcePath, outputPath, suggestionsForDocx);
    console.log('[APPLY-API] DOCX apply result:', applyResult);

    // Descobre thesis_id para padronizar path no Storage
    const { data: chapter, error: chapterError } = await supabase
      .from('chapters')
      .select('thesis_id')
      .eq('id', chapterId)
      .single();

    if (chapterError || !chapter) {
      throw new Error('Chapter not found');
    }

    // Faz upload do novo arquivo
    const newFileName = `theses/${chapter.thesis_id}/chapters/${chapterId}/${randomUUID()}.docx`;
    const outputBuffer = await fs.readFile(outputPath);

    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(newFileName, outputBuffer, {
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        upsert: false
      });

    if (uploadError) {
      console.error('[APPLY-API] Upload error:', uploadError);
      throw new Error(`Failed to upload: ${uploadError.message}`);
    }

    // Cria nova versão usando RPC
    const { data: newVersionId, error: versionRpcError } = await supabase.rpc('create_chapter_version', {
      p_chapter_id: chapterId,
      p_file_path: newFileName,
      p_parent_version_id: job.version_id,
      p_created_by_operation: job.operation,
      p_metadata: {
        acceptedSuggestions: acceptedSuggestions.length,
        totalSuggestions: allSuggestions.length,
        appliedIds: acceptedSuggestionIds,
        appliedFromJobId: jobId,
        applyResult
      }
    });

    if (versionRpcError) {
      console.error('[APPLY-API] Version creation error:', versionRpcError);
      throw new Error(`Failed to create version: ${versionRpcError.message}`);
    }

    // Atualiza job com newVersionId
    await supabase
      .from('chapter_operation_jobs')
      .update({ new_version_id: newVersionId })
      .eq('id', jobId);

    // Limpa arquivos temporários
    await fs.unlink(sourcePath).catch(() => {});
    await fs.unlink(outputPath).catch(() => {});

    console.log(`[APPLY-API] Created new version: ${newVersionId}`);

    return NextResponse.json({
      success: true,
      newVersionId,
      appliedCount: acceptedSuggestions.length,
      unmatchedCount: applyResult.unmatchedCount
    });

  } catch (error: any) {
    console.error('[APPLY-API] Error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
