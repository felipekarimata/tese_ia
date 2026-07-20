import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

/**
 * GET /api/theses - List all theses with chapter counts
 */
export async function GET() {
  try {
    // Fetch all theses
    const { data: theses, error } = await supabase
      .from('theses')
      .select('id, title, description, created_at, updated_at')
      .order('updated_at', { ascending: false });

    if (error) throw error;

    const list = theses || [];
    const thesisIds = list.map((t) => t.id);

    const chapterTitlesByThesis: Record<string, string[]> = {};
    if (thesisIds.length > 0) {
      const { data: chapterRows, error: chError } = await supabase
        .from('chapters')
        .select('thesis_id, title')
        .in('thesis_id', thesisIds);

      if (chError) throw chError;

      for (const row of chapterRows || []) {
        const tid = row.thesis_id as string;
        if (!chapterTitlesByThesis[tid]) chapterTitlesByThesis[tid] = [];
        chapterTitlesByThesis[tid].push(String(row.title));
      }
    }

    const thesesWithCounts = list.map((thesis) => {
      const titles = chapterTitlesByThesis[thesis.id] || [];
      return {
        id: thesis.id,
        title: thesis.title,
        description: thesis.description,
        createdAt: thesis.created_at,
        updatedAt: thesis.updated_at,
        chapterCount: titles.length,
        chapterTitles: titles
      };
    });

    return NextResponse.json({ theses: thesesWithCounts });
  } catch (error: any) {
    console.error('[THESES] Error listing theses:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/theses - Create new thesis
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, description } = body;

    // Validation
    if (!title || title.trim().length === 0) {
      return NextResponse.json(
        { error: 'Thesis title is required' },
        { status: 400 }
      );
    }

    // Create thesis
    const { data: thesis, error } = await supabase
      .from('theses')
      .insert({
        title: title.trim(),
        description: description?.trim() || null
      })
      .select()
      .single();

    if (error) throw error;

    console.log(`[THESES] Created thesis: ${thesis.id} - "${thesis.title}"`);

    return NextResponse.json({
      thesis: {
        id: thesis.id,
        title: thesis.title,
        description: thesis.description,
        createdAt: thesis.created_at,
        updatedAt: thesis.updated_at,
        chapterCount: 0,
        chapterTitles: []
      }
    });
  } catch (error: any) {
    console.error('[THESES] Error creating thesis:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
