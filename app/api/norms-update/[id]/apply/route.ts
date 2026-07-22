import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';
import { NormReference } from '@/lib/norms-update/types';
import { applyNormUpdatesToDocx } from '@/lib/norms-update/apply-docx';

// POST /api/norms-update/[id]/apply - Aplica atualizações aceitas
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params;
    const { acceptedReferenceIds }: { acceptedReferenceIds: string[] } = await req.json();

    if (!acceptedReferenceIds || acceptedReferenceIds.length === 0) {
      return NextResponse.json(
        { error: 'No references selected' },
        { status: 400 }
      );
    }

    const { data: job, error: jobError } = await supabase
      .from('norm_update_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    const allReferences: NormReference[] = job.norm_references || [];
    const acceptedReferences = allReferences.filter(r =>
      acceptedReferenceIds.includes(r.id)
    );

    console.log(`[NORMS-APPLY] Applying ${acceptedReferences.length} updates`);

    let chapterVersionId: string | null = job.chapter_version_id ?? null;
    if (!chapterVersionId && job.document_id) {
      const { data: row } = await supabase
        .from('chapter_versions')
        .select('id')
        .eq('id', job.document_id)
        .maybeSingle();
      if (row) chapterVersionId = row.id;
    }

    const { data: chapterVersion } = chapterVersionId
      ? await supabase
          .from('chapter_versions')
          .select('id, file_path, chapter_id')
          .eq('id', chapterVersionId)
          .single()
      : { data: null };

    if (chapterVersion) {
      const chapterId = chapterVersion.chapter_id;
      const versionId = chapterVersion.id;

      const { data: fileBlob, error: downloadError } = await supabase.storage
        .from('documents')
        .download(chapterVersion.file_path);

      if (downloadError || !fileBlob) {
        return NextResponse.json(
          { error: 'Falha ao baixar arquivo do capítulo' },
          { status: 500 }
        );
      }

      const tempDir = os.tmpdir();
      const tempInputPath = path.join(tempDir, `${jobId}_ch_original.docx`);
      const tempOutputPath = path.join(tempDir, `${jobId}_ch_updated.docx`);
      await fs.writeFile(tempInputPath, Buffer.from(await fileBlob.arrayBuffer()));

      await applyNormUpdatesToDocx(tempInputPath, tempOutputPath, acceptedReferences);

      const { data: chapter } = await supabase
        .from('chapters')
        .select('thesis_id')
        .eq('id', chapterId)
        .single();

      const newFileName = `theses/${chapter?.thesis_id || 'unknown'}/chapters/${chapterId}/${randomUUID()}.docx`;
      const outputBuffer = await fs.readFile(tempOutputPath);

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(newFileName, outputBuffer, {
          contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          upsert: false
        });

      await fs.unlink(tempInputPath).catch(() => {});
      await fs.unlink(tempOutputPath).catch(() => {});

      if (uploadError) {
        return NextResponse.json(
          { error: `Falha ao enviar arquivo: ${uploadError.message}` },
          { status: 500 }
        );
      }

      const { data: newVersionId, error: rpcError } = await supabase.rpc('create_chapter_version', {
        p_chapter_id: chapterId,
        p_file_path: newFileName,
        p_parent_version_id: versionId,
        p_created_by_operation: 'norms-update',
        p_metadata: { appliedNormIds: acceptedReferenceIds, normsJobId: jobId }
      });

      if (rpcError) {
        return NextResponse.json(
          { error: `Falha ao criar nova versão: ${rpcError.message}` },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        chapterId,
        newVersionId,
        message: 'Normas aplicadas. Nova versão do capítulo criada.'
      });
    }

    // Fluxo documento (projeto)
    if (!job.document_id) {
      return NextResponse.json(
        { error: 'Job has no linked document or chapter version' },
        { status: 400 }
      );
    }

    const { data: doc, error: docError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', job.document_id)
      .single();

    if (docError || !doc) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }

    const { data: fileBlob, error: downloadError } = await supabase.storage
      .from('documents')
      .download(doc.file_path);

    if (downloadError || !fileBlob) {
      throw new Error(`Failed to download: ${downloadError?.message}`);
    }

    const tempDir = os.tmpdir();
    const tempInputPath = path.join(tempDir, `${jobId}_${job.document_id}_original.docx`);
    const tempOutputPath = path.join(tempDir, `${jobId}_${job.document_id}_updated.docx`);

    const buffer = Buffer.from(await fileBlob.arrayBuffer());
    await fs.writeFile(tempInputPath, buffer);

    await applyNormUpdatesToDocx(
      tempInputPath,
      tempOutputPath,
      acceptedReferences
    );

    const updatedBuffer = await fs.readFile(tempOutputPath);

    try {
      await fs.unlink(tempInputPath);
      await fs.unlink(tempOutputPath);
    } catch {}

    const sanitizedTitle = (doc.title || 'documento')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .substring(0, 50);

    return new NextResponse(updatedBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${sanitizedTitle}_normas_atualizadas.docx"`
      }
    });

  } catch (error: any) {
    console.error('[NORMS-APPLY] Error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

/**
 * Aplica atualizações de normas ao documento DOCX
 */
