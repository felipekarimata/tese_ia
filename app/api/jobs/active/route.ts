import { NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase';
import { jsonNoStore } from '@/lib/json-no-store-response';
import { isCancellationErrorMessage } from '@/lib/job-cancellation';
import { getMulti3FailureMessage } from '@/lib/multi-ai/errors';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Unified shape returned to the client. `target` is enough info to render
 * a label and link back to the result page.
 */
type ActiveJob = {
  id: string;
  type: 'translate' | 'adjust' | 'adapt' | 'improve' | 'norms-update' | 'chapter-operation' | 'multi3';
  operation?: string;
  status: 'pending' | 'running' | 'completed' | 'error' | 'cancelled';
  progress: number;          // 0-100
  errorMessage?: string;
  createdAt: string;
  completedAt: string | null;
  target: {
    kind: 'document' | 'chapter';
    id: string;
    title?: string;
    projectId?: string;
    thesisId?: string;
  };
  resultHref: string;
};

const RECENT_WINDOW_HOURS = 6;

function normalizeMulti3Status(raw: string, judgeReasoning?: string | null): ActiveJob['status'] {
  if (isCancellationErrorMessage(judgeReasoning)) return 'cancelled';
  const s = (raw || '').toLowerCase();
  if (s === 'accepted' || s === 'awaiting_human') return 'completed';
  if (s === 'failed') return 'error';
  return 'running';
}

function multi3Progress(session: Record<string, unknown>): number {
  const candidates = (session.candidates as any[]) || [];
  const total = candidates.length || 3;
  const done = candidates.filter((c) => c.status === 'completed').length;
  const failed = candidates.filter((c) => c.status === 'failed').length;
  const status = String(session.status || 'running');

  if (status === 'accepted' || status === 'awaiting_human') return 100;
  if (status === 'failed') return Math.min(100, Math.round(((done + failed) / total) * 100));
  if (status === 'judging') return 90;
  if (status === 'candidates_ready') return 85;
  return Math.round((done / total) * 80);
}

function normalizeStatus(raw: string, errorMessage?: string | null): ActiveJob['status'] {
  // Cancellation is encoded as status='error' + a marker in errorMessage,
  // because the DB CHECK constraint does not allow 'cancelled'.
  if (isCancellationErrorMessage(errorMessage)) return 'cancelled';

  const s = (raw || '').toLowerCase();
  if (s === 'completed' || s === 'success' || s === 'done') return 'completed';
  if (s === 'error' || s === 'failed') return 'error';
  if (s === 'pending') return 'pending';
  // anything else considered "running": processing, translating, adjusting, adapting, analyzing...
  return 'running';
}

export async function GET(_req: NextRequest) {
  try {
    const since = new Date(Date.now() - RECENT_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
    const jobs: ActiveJob[] = [];

    // 1. Chapter operations (translate/adapt/adjust/improve/update inside a chapter)
    try {
      const { data: chapterJobs, error } = await supabase
        .from('chapter_operation_jobs')
        .select(`
          id, status, progress, error_message, created_at, completed_at,
          chapter_id, operation,
          chapters!chapter_operation_jobs_chapter_id_fkey (title, thesis_id)
        `)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) console.error('[JOBS] chapter_operation_jobs select error:', error);

      for (const j of chapterJobs ?? []) {
        const ch: any = (j as any).chapters;
        const op = (j as any).operation as string;
        jobs.push({
          id: (j as any).id,
          type: 'chapter-operation',
          operation: op,
          status: normalizeStatus((j as any).status, (j as any).error_message),
          progress: Number((j as any).progress) || 0,
          errorMessage: (j as any).error_message ?? undefined,
          createdAt: (j as any).created_at,
          completedAt: (j as any).completed_at,
          target: {
            kind: 'chapter',
            id: (j as any).chapter_id,
            title: ch?.title,
            thesisId: ch?.thesis_id,
          },
          resultHref: `/chapters/${(j as any).chapter_id}/agent`,
        });
      }
    } catch (e) {
      console.error('[JOBS] chapter_operation_jobs error:', e);
    }

    // 2. Translation jobs (document-level)
    try {
      const { data, error } = await supabase
        .from('translation_jobs')
        .select(`
          id, status, progress_percentage, error_message, created_at, completed_at,
          document_id,
          documents (title, project_id)
        `)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) console.error('[JOBS] translation_jobs select error:', error);

      for (const j of data ?? []) {
        const d: any = (j as any).documents;
        jobs.push({
          id: (j as any).id,
          type: 'translate',
          status: normalizeStatus((j as any).status, (j as any).error_message),
          progress: Number((j as any).progress_percentage) || 0,
          errorMessage: (j as any).error_message ?? undefined,
          createdAt: (j as any).created_at,
          completedAt: (j as any).completed_at,
          target: {
            kind: 'document',
            id: (j as any).document_id,
            title: d?.title,
            projectId: d?.project_id,
          },
          resultHref: `/translations/${(j as any).id}`,
        });
      }
    } catch (e) {
      console.error('[JOBS] translation_jobs error:', e);
    }

    // 3. Adjust jobs (document-level)
    try {
      const { data, error } = await supabase
        .from('adjust_jobs')
        .select(`
          id, status, progress_percentage, error_message, created_at, completed_at,
          document_id,
          documents (title, project_id)
        `)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) console.error('[JOBS] adjust_jobs select error:', error);

      for (const j of data ?? []) {
        const d: any = (j as any).documents;
        jobs.push({
          id: (j as any).id,
          type: 'adjust',
          status: normalizeStatus((j as any).status, (j as any).error_message),
          progress: Number((j as any).progress_percentage) || 0,
          errorMessage: (j as any).error_message ?? undefined,
          createdAt: (j as any).created_at,
          completedAt: (j as any).completed_at,
          target: {
            kind: 'document',
            id: (j as any).document_id,
            title: d?.title,
            projectId: d?.project_id,
          },
          resultHref: `/adjustments/${(j as any).id}`,
        });
      }
    } catch (e) {
      console.error('[JOBS] adjust_jobs error:', e);
    }

    // 4. Adapt jobs (document-level)
    try {
      const { data, error } = await supabase
        .from('adapt_jobs')
        .select(`
          id, status, progress_percentage, error_message, created_at, completed_at,
          document_id,
          documents (title, project_id)
        `)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) console.error('[JOBS] adapt_jobs select error:', error);

      for (const j of data ?? []) {
        const d: any = (j as any).documents;
        jobs.push({
          id: (j as any).id,
          type: 'adapt',
          status: normalizeStatus((j as any).status, (j as any).error_message),
          progress: Number((j as any).progress_percentage) || 0,
          errorMessage: (j as any).error_message ?? undefined,
          createdAt: (j as any).created_at,
          completedAt: (j as any).completed_at,
          target: {
            kind: 'document',
            id: (j as any).document_id,
            title: d?.title,
            projectId: d?.project_id,
          },
          resultHref: `/adaptations/${(j as any).id}`,
        });
      }
    } catch (e) {
      console.error('[JOBS] adapt_jobs error:', e);
    }

    // 5. Improvement jobs (document-level)
    try {
      const { data, error } = await supabase
        .from('improvement_jobs')
        .select(`
          id, status, progress_percentage, error_message, created_at, completed_at,
          document_id,
          documents (title, project_id)
        `)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) console.error('[JOBS] improvement_jobs select error:', error);

      for (const j of data ?? []) {
        const d: any = (j as any).documents;
        jobs.push({
          id: (j as any).id,
          type: 'improve',
          status: normalizeStatus((j as any).status, (j as any).error_message),
          progress: Number((j as any).progress_percentage) || 0,
          errorMessage: (j as any).error_message ?? undefined,
          createdAt: (j as any).created_at,
          completedAt: (j as any).completed_at,
          target: {
            kind: 'document',
            id: (j as any).document_id,
            title: d?.title,
            projectId: d?.project_id,
          },
          resultHref: `/improvements/${(j as any).id}`,
        });
      }
    } catch (e) {
      console.error('[JOBS] improvement_jobs error:', e);
    }

    // 6. Norms update jobs (uses progress_percentage)
    try {
      const { data, error } = await supabase
        .from('norm_update_jobs')
        .select('*')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) console.error('[JOBS] norm_update_jobs select error:', error);

      for (const j of data ?? []) {
        const isChapter = !!(j as any).chapter_id;
        jobs.push({
          id: (j as any).id,
          type: 'norms-update',
          status: normalizeStatus((j as any).status, (j as any).error_message),
          progress: Number((j as any).progress) || Number((j as any).progress_percentage) || 0,
          errorMessage: (j as any).error_message ?? undefined,
          createdAt: (j as any).created_at,
          completedAt: (j as any).completed_at,
          target: {
            kind: isChapter ? 'chapter' : 'document',
            id: (j as any).chapter_id || (j as any).document_id,
          },
          resultHref: `/norms-update/${(j as any).id}`,
        });
      }
    } catch (e) {
      console.error('[JOBS] norm_update_jobs error:', e);
    }

    // 7. Multi-IA sessions (/3)
    try {
      const { data: multi3Rows, error } = await supabase
        .from('multi_ai_sessions')
        .select('id, status, command, command_args, candidates, target_type, target_id, judge_reasoning, created_at, completed_at')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) console.error('[JOBS] multi_ai_sessions select error:', error);

      const chapterIds = [...new Set((multi3Rows ?? []).filter((r: any) => r.target_type === 'chapter').map((r: any) => r.target_id))];
      const documentIds = [...new Set((multi3Rows ?? []).filter((r: any) => r.target_type === 'document').map((r: any) => r.target_id))];

      const chapterTitles = new Map<string, string>();
      const documentMeta = new Map<string, { title?: string; projectId?: string }>();

      if (chapterIds.length > 0) {
        const { data: chapters } = await supabase
          .from('chapters')
          .select('id, title, thesis_id')
          .in('id', chapterIds);
        for (const ch of chapters ?? []) {
          chapterTitles.set((ch as any).id, (ch as any).title);
        }
      }

      if (documentIds.length > 0) {
        const { data: docs } = await supabase
          .from('documents')
          .select('id, title, project_id')
          .in('id', documentIds);
        for (const d of docs ?? []) {
          documentMeta.set((d as any).id, { title: (d as any).title, projectId: (d as any).project_id });
        }
      }

      for (const row of multi3Rows ?? []) {
        const r = row as any;
        const isChapter = r.target_type === 'chapter';
        const candidates = (r.candidates as any[]) || [];
        const status = normalizeMulti3Status(r.status, r.judge_reasoning);
        const errMsg = status === 'error' || status === 'cancelled'
          ? (isCancellationErrorMessage(r.judge_reasoning)
            ? r.judge_reasoning
            : getMulti3FailureMessage({
                status: r.status,
                judgeReasoning: r.judge_reasoning,
                candidates,
              }))
          : undefined;

        jobs.push({
          id: r.id,
          type: 'multi3',
          operation: r.command,
          status,
          progress: multi3Progress(r),
          errorMessage: errMsg,
          createdAt: r.created_at,
          completedAt: r.completed_at,
          target: isChapter
            ? {
                kind: 'chapter',
                id: r.target_id,
                title: chapterTitles.get(r.target_id),
              }
            : {
                kind: 'document',
                id: r.target_id,
                title: documentMeta.get(r.target_id)?.title,
                projectId: documentMeta.get(r.target_id)?.projectId,
              },
          resultHref: isChapter
            ? `/chapters/${r.target_id}/agent`
            : `/projects/${documentMeta.get(r.target_id)?.projectId || ''}/agent`,
        });
      }
    } catch (e) {
      console.error('[JOBS] multi_ai_sessions error:', e);
    }

    jobs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const running = jobs.filter((j) => j.status === 'pending' || j.status === 'running');

    return jsonNoStore({
      jobs,
      runningCount: running.length,
      totalCount: jobs.length,
    });
  } catch (error: any) {
    console.error('[JOBS-ACTIVE] Error:', error);
    return jsonNoStore({ error: error.message }, { status: 500 });
  }
}
