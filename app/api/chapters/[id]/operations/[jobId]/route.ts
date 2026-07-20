import { NextRequest } from 'next/server';
import { getOperationJob } from '@/lib/thesis/chapter-operations';
import { jsonNoStore } from '@/lib/json-no-store-response';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; jobId: string }> }
) {
  try {
    const { jobId } = await params;

    const job = await getOperationJob(jobId);

    if (!job) {
      return jsonNoStore({ error: 'Job not found' }, { status: 404 });
    }

    return jsonNoStore({
      job: {
        id: job.id,
        chapterId: job.chapterId,
        versionId: job.versionId,
        operation: job.operation,
        status: job.status,
        progress: job.progress,
        error: job.errorMessage,
        errorMessage: job.errorMessage,
        newVersionId: job.newVersionId,
        createdAt: job.createdAt,
        completedAt: job.completedAt
      }
    });
  } catch (error: any) {
    console.error('[CHAPTER-OPERATIONS-API] Error:', error);
    return jsonNoStore({ error: error.message }, { status: 500 });
  }
}
