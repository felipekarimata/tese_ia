import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    // Busca documentos do Supabase (não mais de memória)
    const { data: documents, error } = await supabase
      .from('documents')
      .select('id, title, pages, chunks_count, project_id, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[LIST DOCS] Supabase error:', error);
      throw error;
    }

    const docs = (documents || []).map((doc: any) => ({
      id: doc.id,
      title: doc.title,
      pages: doc.pages,
      chunksCount: doc.chunks_count,
      projectId: doc.project_id,
      createdAt: doc.created_at,
    }));

    console.log(`[LIST DOCS] Found ${docs.length} documents in Supabase`);

    return NextResponse.json({ documents: docs });
  } catch (error: any) {
    console.error('Documents list error:', error);
    return NextResponse.json(
      { error: `Failed to list documents: ${error.message}` },
      { status: 500 }
    );
  }
}
