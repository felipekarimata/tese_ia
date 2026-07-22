import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

/**
 * GET /api/chapters/[id] - Get chapter with all versions
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Fetch chapter details with current version
    const { data: chapter, error: chapterError } = await supabase
      .from('chapter_details')
      .select('*')
      .eq('chapter_id', id)
      .single();

    if (chapterError || !chapter) {
      return NextResponse.json(
        { error: 'Chapter not found' },
        { status: 404 }
      );
    }

    // Fetch all versions of this chapter
    const { data: versions, error: versionsError } = await supabase
      .from('chapter_versions')
      .select('*')
      .eq('chapter_id', id)
      .order('version_number', { ascending: false });

    if (versionsError) throw versionsError;

    console.log(`[CHAPTERS] Fetched chapter: ${id} - "${chapter.chapter_title}" with ${versions?.length || 0} versions`);

    return NextResponse.json({
      chapter: {
        id: chapter.chapter_id,
        thesisId: chapter.thesis_id,
        title: chapter.chapter_title,
        chapterOrder: chapter.chapter_order,
        createdAt: chapter.chapter_created_at,
        updatedAt: chapter.chapter_updated_at,
        currentVersion: chapter.current_version_id ? {
          id: chapter.current_version_id,
          versionNumber: chapter.version_number,
          filePath: chapter.file_path,
          pages: chapter.pages,
          chunksCount: chapter.chunks_count,
          createdByOperation: chapter.created_by_operation,
          metadata: chapter.metadata,
          createdAt: chapter.version_created_at
        } : null,
        totalVersions: chapter.total_versions
      },
      versions: (versions || []).map((v: any) => ({
        id: v.id,
        versionNumber: v.version_number,
        parentVersionId: v.parent_version_id,
        filePath: v.file_path,
        pages: v.pages,
        chunksCount: v.chunks_count,
        createdByOperation: v.created_by_operation,
        metadata: v.metadata,
        createdAt: v.created_at
      }))
    });
  } catch (error: any) {
    console.error('[CHAPTERS] Error getting chapter:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/chapters/[id] - Update chapter metadata (not version)
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { title, chapterOrder } = body;

    // Prepare fields to update
    const updates: any = {};

    if (title !== undefined && title.trim().length > 0) {
      updates.title = title.trim();
    }

    if (chapterOrder !== undefined) {
      const order = parseInt(chapterOrder, 10);
      if (isNaN(order) || order < 1) {
        return NextResponse.json(
          { error: 'chapterOrder must be a positive integer' },
          { status: 400 }
        );
      }

      // Check if new order conflicts with existing chapter
      const { data: chapter } = await supabase
        .from('chapters')
        .select('thesis_id')
        .eq('id', id)
        .single();

      if (!chapter) {
        return NextResponse.json(
          { error: 'Chapter not found' },
          { status: 404 }
        );
      }

      const { data: conflictingChapter } = await supabase
        .from('chapters')
        .select('id')
        .eq('thesis_id', chapter.thesis_id)
        .eq('chapter_order', order)
        .neq('id', id)
        .single();

      if (conflictingChapter) {
        return NextResponse.json(
          { error: `Chapter order ${order} is already taken in this thesis` },
          { status: 400 }
        );
      }

      updates.chapter_order = order;
    }

    // Validate
    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      );
    }

    // Update the chapter
    const { data: updatedChapter, error } = await supabase
      .from('chapters')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error || !updatedChapter) {
      return NextResponse.json(
        { error: error?.message || 'Chapter not found' },
        { status: error ? 500 : 404 }
      );
    }

    console.log(`[CHAPTERS] Updated chapter: ${id} - "${updatedChapter.title}"`);

    return NextResponse.json({
      chapter: {
        id: updatedChapter.id,
        thesisId: updatedChapter.thesis_id,
        title: updatedChapter.title,
        chapterOrder: updatedChapter.chapter_order,
        createdAt: updatedChapter.created_at,
        updatedAt: updatedChapter.updated_at
      }
    });
  } catch (error: any) {
    console.error('[CHAPTERS] Error updating chapter:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/chapters/[id] - Delete chapter (CASCADE deletes versions and chunks)
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Fetch chapter details
    const { data: chapter } = await supabase
      .from('chapters')
      .select('id, title, thesis_id')
      .eq('id', id)
      .single();

    if (!chapter) {
      return NextResponse.json(
        { error: 'Chapter not found' },
        { status: 404 }
      );
    }

    // Fetch all versions to get their file paths before deletion
    const { data: versions } = await supabase
      .from('chapter_versions')
      .select('file_path')
      .eq('chapter_id', id);

    // Delete files from Supabase Storage
    if (versions && versions.length > 0) {
      const filePaths = versions
        .map((v: any) => v.file_path)
        .filter((path: any): path is string => path !== null && path !== undefined);

      if (filePaths.length > 0) {
        try {
          const { data: removedFiles, error: storageError } = await supabase.storage
            .from('documents')
            .remove(filePaths);

          if (storageError) {
            console.error(`[CHAPTERS] Error deleting files from Storage:`, storageError);
            // Continue with chapter deletion even if storage deletion fails
          } else {
            console.log(`[CHAPTERS] Deleted ${filePaths.length} file(s) from Storage`);
          }
        } catch (storageErr: any) {
          console.error(`[CHAPTERS] Exception deleting files from Storage:`, storageErr);
          // Continue with chapter deletion even if storage deletion fails
        }
      }
    }

    // Also try to delete the entire directory (in case there are orphaned files)
    const directoryPath = `theses/${chapter.thesis_id}/chapters/${id}/`;
    try {
      // List all files in the directory
      const { data: directoryFiles, error: listError } = await supabase.storage
        .from('documents')
        .list(directoryPath);

      if (!listError && directoryFiles && directoryFiles.length > 0) {
        const filesToDelete = directoryFiles.map((file: any) => `${directoryPath}${file.name}`);
        const { error: removeDirError } = await supabase.storage
          .from('documents')
          .remove(filesToDelete);

        if (removeDirError) {
          console.error(`[CHAPTERS] Error deleting directory files:`, removeDirError);
        } else {
          console.log(`[CHAPTERS] Deleted ${filesToDelete.length} additional file(s) from directory`);
        }
      }
    } catch (dirErr: any) {
      console.error(`[CHAPTERS] Exception cleaning up directory:`, dirErr);
      // Continue with chapter deletion even if directory cleanup fails
    }

    // Delete the chapter (CASCADE will delete versions and chunks)
    const { error } = await supabase
      .from('chapters')
      .delete()
      .eq('id', id);

    if (error) throw error;

    console.log(`[CHAPTERS] Deleted chapter: ${id} - "${chapter.title}"`);

    return NextResponse.json({
      message: 'Chapter deleted successfully',
      chapterId: id
    });
  } catch (error: any) {
    console.error('[CHAPTERS] Error deleting chapter:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
