import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const runtime = 'nodejs';

/**
 * GET /api/documents/[id]/translations
 * Lista todas as traduções de um documento
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: documentId } = await params;

    // Busca traduções do documento no Supabase
    const { data: translations, error } = await supabase
      .from('translation_jobs')
      .select('*')
      .eq('document_id', documentId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[TRANSLATIONS] Error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch translations' },
        { status: 500 }
      );
    }

    return NextResponse.json({ translations: translations || [] });

  } catch (error: any) {
    console.error('Translations list error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
