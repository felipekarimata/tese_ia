import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requestCancellation, CANCELLATION_MARKER } from '@/lib/job-cancellation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/jobs/cancel
 * body: { jobId, type }
 *
 * Marks a running job for cancellation. The pipeline checks the in-memory
 * flag between AI calls and aborts before making the next paid request.
 *
 * `type` tells us which table to update so the UI flips to a cancelled
 * state on the next poll.
 */

const TABLE_BY_TYPE: Record<string, string> = {
  'chapter-operation': 'chapter_operation_jobs',
  'translate':         'translation_jobs',
  'adjust':            'adjust_jobs',
  'adapt':             'adapt_jobs',
  'improve':           'improvement_jobs',
  'norms-update':      'norm_update_jobs',
  'multi3':            'multi_ai_sessions',
};

const RUNNING_STATUSES_BY_TABLE: Record<string, string[]> = {
  chapter_operation_jobs: ['pending', 'processing', 'translating', 'adjusting', 'adapting', 'analyzing'],
  translation_jobs: ['pending', 'processing', 'translating'],
  adjust_jobs: ['pending', 'processing', 'adjusting'],
  adapt_jobs: ['pending', 'processing', 'adapting'],
  improvement_jobs: ['pending', 'processing', 'analyzing'],
  norm_update_jobs: ['pending', 'processing'],
  multi_ai_sessions: ['running', 'processing', 'candidates_ready', 'judging'],
};

export async function POST(req: NextRequest) {
  try {
    const { jobId, type } = await req.json();
    if (!jobId || typeof jobId !== 'string') {
      return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });
    }

    // Always flag the in-memory tracker so the running pipeline aborts
    requestCancellation(jobId);

    // Best-effort DB update so the UI reflects the cancellation immediately
    // even if the pipeline hasn't reached its next checkpoint yet.
    const table = TABLE_BY_TYPE[type];
    if (table) {
      try {
        const runningStatuses = RUNNING_STATUSES_BY_TABLE[table] || ['pending', 'processing'];
        const updatePayload = type === 'multi3'
          ? {
              status: 'failed',
              judge_reasoning: `${CANCELLATION_MARKER} Cancelado pelo usuário antes da próxima chamada à IA.`,
              completed_at: new Date().toISOString(),
            }
          : {
              status: 'error',
              error_message: `${CANCELLATION_MARKER} Cancelado pelo usuário antes da próxima chamada à IA.`,
              completed_at: new Date().toISOString(),
            };

        await supabase
          .from(table)
          .update(updatePayload)
          .eq('id', jobId)
          .in('status', runningStatuses);
      } catch (e) {
        console.warn('[JOBS-CANCEL] DB update failed (non-fatal):', e);
      }
    }

    console.log(`[JOBS-CANCEL] Cancellation requested for job ${jobId} (type=${type})`);
    return NextResponse.json({ ok: true, jobId });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
