import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  try {
    const { versionId } = await params;

    console.log(`[DOWNLOAD] Fetching version: ${versionId}`);

    // Busca versão
    const { data: version, error: versionError } = await supabase
      .from('chapter_versions')
      .select('*, chapters!chapter_versions_chapter_id_fkey(title, chapter_order, thesis_id, theses(title))')
      .eq('id', versionId)
      .single();

    if (versionError) {
      console.error('[DOWNLOAD] Version error:', versionError);
      return NextResponse.json(
        { error: 'Version not found', details: versionError.message },
        { status: 404 }
      );
    }

    if (!version) {
      console.error('[DOWNLOAD] Version not found in database');
      return NextResponse.json(
        { error: 'Version not found' },
        { status: 404 }
      );
    }

    console.log(`[DOWNLOAD] Version found:`, {
      id: version.id,
      file_path: version.file_path,
      chapter_id: version.chapter_id
    });

    // Baixa arquivo do Storage
    const { data: fileBlob, error: downloadError } = await supabase.storage
      .from('documents')
      .download(version.file_path);

    if (downloadError || !fileBlob) {
      console.error('[DOWNLOAD] Error:', downloadError);
      return NextResponse.json(
        { error: 'Failed to download file' },
        { status: 500 }
      );
    }

    // Gera nome do arquivo amigável
    const chapterTitle = version.chapters?.title || 'capitulo';
    const chapterOrder = version.chapters?.chapter_order || 0;
    const versionNumber = version.version_number;
    const operation = version.created_by_operation;

    // Remove caracteres especiais do nome
    const sanitizedTitle = chapterTitle
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9\s-]/g, '')
      .replace(/\s+/g, '_')
      .toLowerCase();

    const fileName = `cap${chapterOrder}_${sanitizedTitle}_v${versionNumber}_${operation}.docx`;

    console.log(`[DOWNLOAD] Downloading version ${versionId}: ${fileName}`);

    // Converte blob para buffer
    const arrayBuffer = await fileBlob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Retorna arquivo
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': buffer.length.toString()
      }
    });

  } catch (error: any) {
    console.error('[DOWNLOAD] Error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
