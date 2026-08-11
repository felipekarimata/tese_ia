import { NextRequest, NextResponse } from 'next/server';
import { startBookAssemblyJob } from '@/lib/book-assembly/engine';
import { getBookAssemblyJob, updateBookAssemblyJob } from '@/lib/book-assembly/repository';

export const runtime = 'nodejs';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; jobId: string }> }
) {
  try {
    const { id: thesisId, jobId } = await params;
    const job = await getBookAssemblyJob(jobId);
    if (!job || job.thesisId !== thesisId) {
      return NextResponse.json({ error: 'Montagem não encontrada' }, { status: 404 });
    }
    if (job.status !== 'awaiting_changes_approval') {
      return NextResponse.json({ error: 'As alterações não estão aguardando aprovação' }, { status: 409 });
    }

    const body = await request.json().catch(() => ({}));
    const allIds = new Set(
      job.chapterResults.flatMap((result) => result.suggestions.map((suggestion) => suggestion.id))
    );
    const requested: string[] = Array.isArray(body.approvedSuggestionIds)
      ? body.approvedSuggestionIds.map((value: unknown) => String(value))
      : [...allIds];
    const approvedSuggestionIds: string[] = [...new Set<string>(requested)]
      .filter((id) => allIds.has(id));

    await updateBookAssemblyJob(jobId, {
      status: 'finalizing',
      resumeStage: 'finalizing',
      approvedSuggestionIds,
      progress: 84,
      progressLabel: 'Aplicando as alterações aprovadas',
      errorMessage: null,
    });
    startBookAssemblyJob(jobId);
    return NextResponse.json({ success: true, approvedSuggestions: approvedSuggestionIds.length }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
