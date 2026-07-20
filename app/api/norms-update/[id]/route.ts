import { NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase';
import { jsonNoStore } from '@/lib/json-no-store-response';

export const dynamic = 'force-dynamic';

// GET /api/norms-update/[id] - Busca status do job
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params;

    const { data: job, error } = await supabase
      .from('norm_update_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (error || !job) {
      return jsonNoStore({ error: 'Job not found' }, { status: 404 });
    }

    let source: 'document' | 'chapter' = 'document';
    let chapterId: string | null = null;
    let versionId: string | null = null;

    const idsToCheck = [
      ...new Set(
        [job.chapter_version_id, job.document_id].filter(
          (x): x is string => typeof x === 'string' && x.length > 0
        )
      )
    ];
    for (const vid of idsToCheck) {
      const { data: cv } = await supabase
        .from('chapter_versions')
        .select('chapter_id, id')
        .eq('id', vid)
        .maybeSingle();
      if (cv) {
        source = 'chapter';
        chapterId = cv.chapter_id;
        versionId = cv.id;
        break;
      }
    }

    // Formata resposta
    const activityLog = Array.isArray(job.activity_log) ? job.activity_log : [];

    return jsonNoStore({
      jobId: job.id,
      documentId: job.document_id,
      source,
      ...(source === 'chapter' && chapterId && versionId ? { chapterId, versionId } : {}),
      status: job.status,
      progress: {
        currentReference: job.current_reference,
        totalReferences: job.total_references,
        percentage: job.progress_percentage
      },
      activityLog,
      references: job.norm_references || [],
      stats: {
        total: job.total_references,
        vigentes: job.vigentes,
        alteradas: job.alteradas,
        revogadas: job.revogadas,
        substituidas: job.substituidas,
        manualReview: job.manual_review
      },
      error: job.error_message,
      createdAt: job.created_at,
      startedAt: job.started_at,
      completedAt: job.completed_at
    });
  } catch (error: any) {
    console.error('[NORMS] Error fetching job:', error);
    return jsonNoStore({ error: error.message }, { status: 500 });
  }
}
