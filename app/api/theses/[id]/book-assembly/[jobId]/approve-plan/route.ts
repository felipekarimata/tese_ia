import { NextRequest, NextResponse } from 'next/server';
import { startBookAssemblyJob } from '@/lib/book-assembly/engine';
import { getBookAssemblyJob, updateBookAssemblyJob } from '@/lib/book-assembly/repository';

export const runtime = 'nodejs';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; jobId: string }> }
) {
  try {
    const { id: thesisId, jobId } = await params;
    const job = await getBookAssemblyJob(jobId);
    if (!job || job.thesisId !== thesisId) {
      return NextResponse.json({ error: 'Montagem não encontrada' }, { status: 404 });
    }
    if (job.status !== 'awaiting_plan_approval') {
      return NextResponse.json({ error: 'O plano editorial não está aguardando aprovação' }, { status: 409 });
    }

    await updateBookAssemblyJob(jobId, {
      status: 'harmonizing',
      resumeStage: 'harmonizing',
      progress: 42,
      progressLabel: 'Plano aprovado; iniciando a harmonização',
      errorMessage: null,
    });
    startBookAssemblyJob(jobId);
    return NextResponse.json({ success: true }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
