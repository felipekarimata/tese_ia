import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { parseDocument } from '@/lib/parsers';
import path from 'path';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  try {
    const { versionId } = await params;

    const { data: version, error } = await supabase
      .from('chapter_versions')
      .select('file_path, version_number')
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

    // Use parseDocument which handles PDF, DOCX, and TXT properly
    const fileName = path.basename(version.file_path);
    const { text, pages } = await parseDocument(buffer, fileName);

    return NextResponse.json({ text, pages, versionNumber: version.version_number });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
