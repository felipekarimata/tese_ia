import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { ensureDocumentInMemory } from '@/lib/document-loader';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    console.log(`[GET DOC] Looking for document: ${id}`);

    // Busca no Supabase (source of truth)
    const { data: doc, error } = await supabase
      .from('documents')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !doc) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      id: (doc as any).id,
      title: (doc as any).title,
      pages: (doc as any).pages,
      chunksCount: (doc as any).chunks_count,
      projectId: (doc as any).project_id,
      filePath: (doc as any).file_path,
      createdAt: (doc as any).created_at,
      updatedAt: (doc as any).updated_at,
    });
  } catch (error: any) {
    console.error('Document get error:', error);
    return NextResponse.json(
      { error: `Failed to get document: ${error.message}` },
      { status: 500 }
    );
  }
}
