import { NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase';
import { jsonNoStore } from '@/lib/json-no-store-response';

export const dynamic = 'force-dynamic';

/**
 * GET /api/adapt/[id] - Get adapt job status
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params;

    const { data: job, error } = await supabase
      .from('adapt_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (error || !job) {
      return jsonNoStore({ error: 'Job not found' }, { status: 404 });
    }

    return jsonNoStore({
      jobId: job.id,
      documentId: job.document_id,
      status: job.status,
      style: job.style,
      targetAudience: job.target_audience,
      provider: job.provider,
      model: job.model,
      progress: {
        currentSection: job.current_section || 0,
        totalSections: job.total_sections || 0,
        percentage: job.progress_percentage || 0
      },
      documentStructure: job.document_structure || {},
      suggestions: job.suggestions || [],
      error: job.error_message,
      createdAt: job.created_at,
      startedAt: job.started_at,
      completedAt: job.completed_at
    });
  } catch (error: any) {
    console.error('[ADAPT] Error:', error);
    return jsonNoStore({ error: error.message }, { status: 500 });
  }
}
