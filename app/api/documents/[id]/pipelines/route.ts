import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const documentId = params.id;

    // Fetch pipeline jobs for this document
    const { data: jobs, error } = await supabase
      .from('pipeline_jobs')
      .select('*')
      .eq('document_id', documentId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      console.error('Error fetching pipeline jobs:', error);
      return NextResponse.json({ jobs: [] });
    }

    return NextResponse.json({ jobs: jobs || [] });
  } catch (error: any) {
    console.error('Pipeline jobs fetch error:', error);
    return NextResponse.json({ jobs: [] });
  }
}
