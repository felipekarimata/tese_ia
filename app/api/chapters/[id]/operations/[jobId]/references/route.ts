import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; jobId: string }> }
) {
  try {
    const { jobId } = await params;

    // Fetch references for the job
    const { data: referencesData, error: referencesError } = await supabase
      .from('operation_references')
      .select('*')
      .eq('job_id', jobId)
      .order('created_at', { ascending: true });

    if (referencesError) {
      console.error('[REFERENCES-API] Error fetching references:', referencesError);
      return NextResponse.json({ error: 'Falha ao buscar referências' }, { status: 500 });
    }

    // Transform to camelCase
    const references = (referencesData || []).map((ref: any) => ({
      id: ref.id,
      referenceType: ref.reference_type,
      referenceContent: ref.reference_content,
      title: ref.title,
      description: ref.description,
      fileName: ref.file_name,
      fileSize: ref.file_size,
      mimeType: ref.mime_type,
      createdAt: ref.created_at,
    }));

    return NextResponse.json({ references });
  } catch (error: any) {
    console.error('[REFERENCES-API] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Erro ao buscar referências' },
      { status: 500 }
    );
  }
}
