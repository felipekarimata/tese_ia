import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const runtime = 'nodejs';

/**
 * GET /api/documents/[id]/norm-jobs — jobs de atualização de normas do documento (não inclui jobs de capítulo).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: documentId } = await params;

    const { data, error } = await supabase
      .from('norm_update_jobs')
      .select(
        'id, status, progress_percentage, current_reference, total_references, created_at, started_at, completed_at, error_message'
      )
      .eq('document_id', documentId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[NORM-JOBS] List error:', error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ jobs: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
