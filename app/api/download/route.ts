import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const runtime = 'nodejs';

/**
 * GET /api/download?bucket=documents&path=uploads/file.pdf
 * Download file from Supabase Storage
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const bucket = searchParams.get('bucket');
    const filePath = searchParams.get('path');

    if (!bucket || !filePath) {
      return NextResponse.json(
        { error: 'Missing bucket or path parameter' },
        { status: 400 }
      );
    }

    console.log(`[DOWNLOAD] Fetching ${filePath} from bucket ${bucket}`);

    // Download do Supabase Storage
    const { data, error } = await supabase.storage
      .from(bucket)
      .download(filePath);

    if (error || !data) {
      console.error('[DOWNLOAD] Error:', error);
      return NextResponse.json(
        { error: `Failed to download file: ${error?.message}` },
        { status: 404 }
      );
    }

    // Converte Blob para Buffer
    const arrayBuffer = await data.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Determina o Content-Type baseado na extensão
    const ext = filePath.split('.').pop()?.toLowerCase();
    const contentTypes: Record<string, string> = {
      'pdf': 'application/pdf',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'txt': 'text/plain',
      'doc': 'application/msword'
    };
    const contentType = contentTypes[ext || ''] || 'application/octet-stream';

    // Extrai o nome do arquivo
    const fileName = filePath.split('/').pop() || 'download';

    // Retorna o arquivo com headers corretos para download
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': buffer.length.toString()
      }
    });

  } catch (error: any) {
    console.error('Download error:', error);
    return NextResponse.json(
      { error: `Download failed: ${error.message}` },
      { status: 500 }
    );
  }
}
