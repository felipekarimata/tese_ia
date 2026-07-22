import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const { data: doc, error } = await supabase
      .from('documents')
      .select('id, title, file_path')
      .eq('id', id)
      .single();

    if (error || !doc || !(doc as { file_path?: string }).file_path) {
      return NextResponse.json(
        { error: 'Document not found or missing file' },
        { status: 404 }
      );
    }

    const filePath = (doc as { file_path: string }).file_path;
    const title = (doc as { title?: string }).title || 'documento';

    const { data: fileBlob, error: downloadError } = await supabase.storage
      .from('documents')
      .download(filePath);

    if (downloadError || !fileBlob) {
      console.error('[DOC-DOWNLOAD]', downloadError);
      return NextResponse.json(
        { error: 'Failed to download file' },
        { status: 500 }
      );
    }

    const sanitized = title
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9\s-]/g, '')
      .replace(/\s+/g, '_')
      .toLowerCase()
      .slice(0, 80) || 'documento';

    const fileName = `${sanitized}.docx`;
    const buffer = Buffer.from(await fileBlob.arrayBuffer());

    return new NextResponse(buffer, {
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${fileName}"`
      }
    });
  } catch (e: any) {
    console.error('[DOC-DOWNLOAD]', e);
    return NextResponse.json(
      { error: e.message || 'Download failed' },
      { status: 500 }
    );
  }
}
