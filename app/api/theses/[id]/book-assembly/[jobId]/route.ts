import { NextRequest, NextResponse } from 'next/server';
import { getBookAssemblyJob } from '@/lib/book-assembly/repository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; jobId: string }> }
) {
  try {
    const { id: thesisId, jobId } = await params;
    const job = await getBookAssemblyJob(jobId);
    if (!job || job.thesisId !== thesisId) {
      return NextResponse.json({ error: 'Montagem não encontrada' }, { status: 404 });
    }
    return NextResponse.json(
      {
        job,
        downloadUrl: job.resultThesisVersionId
          ? `/api/theses/${thesisId}/versions/${job.resultThesisVersionId}/download`
          : null,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
