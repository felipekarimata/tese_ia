import { NextRequest, NextResponse } from 'next/server';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { randomUUID } from 'crypto';
import { supabase } from '@/lib/supabase';
import { processChapterVersion } from '@/lib/thesis/chapter-processor';
import { stripNonEditableDocParts } from '@/lib/docx/html-extract';
import HTMLtoDOCX from 'html-to-docx';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  try {
    const { id: chapterId, versionId } = await params;
    const body = await req.json();
    const { html, text } = body as { html?: string; text?: string };

    if (typeof html === 'string' && html.trim()) {
      return saveHtmlEdit(chapterId, versionId, html);
    }

    if (typeof text === 'string' && text.trim()) {
      return saveTextEdit(chapterId, versionId, text);
    }

    return NextResponse.json(
      { error: 'HTML ou texto da versão é obrigatório' },
      { status: 400 }
    );
  } catch (error: any) {
    console.error('[MANUAL-EDIT] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function saveHtmlEdit(chapterId: string, versionId: string, html: string) {
  const { data: version, error: versionError } = await supabase
    .from('chapter_versions')
    .select('id, chapter_id')
    .eq('id', versionId)
    .eq('chapter_id', chapterId)
    .single();

  if (versionError || !version) {
    return NextResponse.json({ error: 'Versão não encontrada' }, { status: 404 });
  }

  const { data: chapter, error: chapterError } = await supabase
    .from('chapters')
    .select('thesis_id')
    .eq('id', chapterId)
    .single();

  if (chapterError || !chapter) {
    return NextResponse.json({ error: 'Capítulo não encontrado' }, { status: 404 });
  }

  const bodyHtml = stripNonEditableDocParts(html);
  const wrappedHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${bodyHtml}</body></html>`;

  const docxArrayBuffer = await HTMLtoDOCX(wrappedHtml, null, {
    table: { row: { cantSplit: true } },
    footer: false,
    header: false,
  });

  const buffer = Buffer.from(docxArrayBuffer);

  return uploadNewVersion(chapterId, versionId, chapter.thesis_id, buffer);
}

async function saveTextEdit(chapterId: string, versionId: string, text: string) {
  const { data: version, error: versionError } = await supabase
    .from('chapter_versions')
    .select('id, chapter_id')
    .eq('id', versionId)
    .eq('chapter_id', chapterId)
    .single();

  if (versionError || !version) {
    return NextResponse.json({ error: 'Versão não encontrada' }, { status: 404 });
  }

  const { data: chapter, error: chapterError } = await supabase
    .from('chapters')
    .select('thesis_id')
    .eq('id', chapterId)
    .single();

  if (chapterError || !chapter) {
    return NextResponse.json({ error: 'Capítulo não encontrado' }, { status: 404 });
  }

  const doc = new Document({
    sections: [{
      properties: {},
      children: textToParagraphs(text),
    }],
  });
  const buffer = await Packer.toBuffer(doc);

  return uploadNewVersion(chapterId, versionId, chapter.thesis_id, buffer);
}

async function uploadNewVersion(
  chapterId: string,
  versionId: string,
  thesisId: string,
  buffer: Buffer
) {
  const storagePath = `theses/${thesisId}/chapters/${chapterId}/${randomUUID()}.docx`;
  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(storagePath, buffer, {
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`Falha ao enviar nova versão: ${uploadError.message}`);
  }

  const { data: newVersionId, error: rpcError } = await supabase.rpc('create_chapter_version', {
    p_chapter_id: chapterId,
    p_file_path: storagePath,
    p_parent_version_id: versionId,
    p_created_by_operation: 'adjust',
    p_metadata: {
      manualEdit: true,
      source: 'agent-editor',
    },
  });

  if (rpcError) {
    throw new Error(`Falha ao criar nova versão: ${rpcError.message}`);
  }

  await processChapterVersion(newVersionId);

  return NextResponse.json({
    success: true,
    newVersionId,
    message: 'Edição manual salva como nova versão',
  });
}

function textToParagraphs(text: string): Paragraph[] {
  const blocks = text.replace(/\r\n/g, '\n').split('\n');

  return blocks.map((line) => new Paragraph({
    children: [new TextRun(line || ' ')],
    spacing: { after: 160 },
  }));
}
