import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

/**
 * GET /api/pipeline/[id]/download?type=final|intermediate&index=N
 * Download pipeline output documents
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params;
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') || 'final';
    const operationIndex = searchParams.get('index');

    // Load pipeline job
    const { data: job, error: jobError } = await supabase
      .from('pipeline_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: 'Pipeline job not found' },
        { status: 404 }
      );
    }

    let downloadPath: string;
    let filename: string;

    if (type === 'final') {
      // Download final document
      if (!job.final_document_path) {
        return NextResponse.json(
          { error: 'Final document not available yet' },
          { status: 404 }
        );
      }

      downloadPath = job.final_document_path;
      filename = `pipeline_final_${jobId}.docx`;

    } else if (type === 'intermediate') {
      // Download intermediate document
      if (!operationIndex) {
        return NextResponse.json(
          { error: 'Operation index is required for intermediate documents' },
          { status: 400 }
        );
      }

      const { data: intermediateDoc, error: docError } = await supabase
        .from('pipeline_intermediate_documents')
        .select('*')
        .eq('pipeline_job_id', jobId)
        .eq('operation_index', parseInt(operationIndex))
        .single();

      if (docError || !intermediateDoc) {
        return NextResponse.json(
          { error: 'Intermediate document not found' },
          { status: 404 }
        );
      }

      downloadPath = intermediateDoc.storage_path;
      filename = `pipeline_${intermediateDoc.operation_name}_${jobId}.docx`;

    } else {
      return NextResponse.json(
        { error: 'Invalid type. Must be "final" or "intermediate"' },
        { status: 400 }
      );
    }

    // Download from Storage
    const { data: fileBlob, error: downloadError } = await supabase.storage
      .from('pipeline-outputs')
      .download(downloadPath);

    if (downloadError || !fileBlob) {
      console.error('[PIPELINE] Download error:', downloadError);
      return NextResponse.json(
        { error: 'Failed to download document' },
        { status: 500 }
      );
    }

    const buffer = Buffer.from(await fileBlob.arrayBuffer());

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${filename}"`
      }
    });

  } catch (error: any) {
    console.error('[PIPELINE] Error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
