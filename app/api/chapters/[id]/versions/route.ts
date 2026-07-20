import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

/**
 * GET /api/chapters/[id]/versions - List all versions of a chapter
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: chapterId } = await params;

    // Verify chapter exists
    const { data: chapter, error: chapterError } = await supabase
      .from('chapters')
      .select('id, title, current_version_id')
      .eq('id', chapterId)
      .single();

    if (chapterError || !chapter) {
      return NextResponse.json(
        { error: 'Chapter not found' },
        { status: 404 }
      );
    }

    // Fetch all versions
    const { data: versions, error: versionsError } = await supabase
      .from('chapter_versions')
      .select('*')
      .eq('chapter_id', chapterId)
      .order('version_number', { ascending: false });

    if (versionsError) throw versionsError;

    console.log(`[CHAPTERS] Fetched ${versions?.length || 0} versions for chapter: ${chapterId}`);

    return NextResponse.json({
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      currentVersionId: chapter.current_version_id,
      totalVersions: versions?.length || 0,
      versions: (versions || []).map(v => ({
        id: v.id,
        versionNumber: v.version_number,
        parentVersionId: v.parent_version_id,
        filePath: v.file_path,
        pages: v.pages,
        chunksCount: v.chunks_count,
        createdByOperation: v.created_by_operation,
        metadata: v.metadata,
        createdAt: v.created_at,
        isCurrent: v.id === chapter.current_version_id
      }))
    });
  } catch (error: any) {
    console.error('[CHAPTERS] Error fetching versions:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
