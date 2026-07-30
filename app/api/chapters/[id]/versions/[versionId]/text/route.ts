import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { extractDocxHtml } from '@/lib/docx/html-extract';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  try {
    const { versionId } = await params;

    const { data: version, error } = await supabase
      .from('chapter_versions')
      .select('file_path, version_number, metadata')
      .eq('id', versionId)
      .single();

    if (error || !version) {
      return NextResponse.json({ error: 'Version not found' }, { status: 404 });
    }

    const { data: fileBlob, error: downloadError } = await supabase.storage
      .from('documents')
      .download(version.file_path);

    if (downloadError || !fileBlob) {
      return NextResponse.json({ error: 'Failed to download file' }, { status: 500 });
    }

    const arrayBuffer = await fileBlob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    try {
      const { html, text, warnings } = await extractDocxHtml(buffer);
      return NextResponse.json({
        text,
        html,
        warnings,
        versionNumber: version.version_number,
        metadata: version.metadata ?? {},
      });
    } catch {
      const text = buffer.toString('utf-8').replace(/[^\x20-\x7E\n\r\tÀ-ɏ]/g, ' ');
      const escaped = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      const html = `<p>${escaped.replace(/\n\n+/g, '</p><p>').replace(/\n/g, '<br/>')}</p>`;
      return NextResponse.json({
        text,
        html,
        warnings: [],
        versionNumber: version.version_number,
        metadata: version.metadata ?? {},
      });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
