import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  try {
    const { id: thesisId, versionId } = await params;

    console.log('[THESIS-VERSION-DOWNLOAD] Downloading:', { thesisId, versionId });

    // Get thesis version info
    const { data: version, error: versionError } = await supabase
      .from('thesis_versions')
      .select('file_path, version_number')
      .eq('id', versionId)
      .eq('thesis_id', thesisId)
      .single();

    if (versionError || !version) {
      return NextResponse.json(
        { error: 'Thesis version not found' },
        { status: 404 }
      );
    }

    // Download file from storage
    const { data: fileBlob, error: downloadError } = await supabase.storage
      .from('documents')
      .download(version.file_path);

    if (downloadError || !fileBlob) {
      console.error('[THESIS-VERSION-DOWNLOAD] Download error:', downloadError);
      return NextResponse.json(
        { error: 'Failed to download file' },
        { status: 500 }
      );
    }

    // Convert blob to buffer
    const arrayBuffer = await fileBlob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Return file
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="tese_v${version.version_number}.docx"`,
      },
    });

  } catch (error: any) {
    console.error('[THESIS-VERSION-DOWNLOAD] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Download failed' },
      { status: 500 }
    );
  }
}
