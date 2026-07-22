import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { mergeChapterVersions, uploadMergedDocument, ChapterSelection } from '@/lib/thesis/document-merger';

type CompileRequest = {
  chapterSelections: {
    chapterId: string;
    versionId: string;
  }[];
  options?: {
    includeCoverPage?: boolean;
    customTitle?: string;
  };
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: thesisId } = await params;
    const body: CompileRequest = await request.json();

    console.log('[COMPILE-API] Starting compilation for thesis:', thesisId);
    console.log('[COMPILE-API] Selections:', body.chapterSelections);

    // 1. Validate thesis exists
    const { data: thesis, error: thesisError } = await supabase
      .from('theses')
      .select('id, title')
      .eq('id', thesisId)
      .single();

    if (thesisError || !thesis) {
      return NextResponse.json(
        { error: 'Thesis not found' },
        { status: 404 }
      );
    }

    // 2. Validate and fetch all selected chapter versions
    const selections: ChapterSelection[] = [];

    for (const selection of body.chapterSelections) {
      // Get chapter info
      const { data: chapter, error: chapterError } = await supabase
        .from('chapters')
        .select('id, thesis_id, title, chapter_order')
        .eq('id', selection.chapterId)
        .single();

      if (chapterError || !chapter) {
        return NextResponse.json(
          { error: `Chapter not found: ${selection.chapterId}` },
          { status: 404 }
        );
      }

      // Verify chapter belongs to this thesis
      if (chapter.thesis_id !== thesisId) {
        return NextResponse.json(
          { error: `Chapter ${selection.chapterId} does not belong to thesis ${thesisId}` },
          { status: 400 }
        );
      }

      // Get version info
      const { data: version, error: versionError } = await supabase
        .from('chapter_versions')
        .select('id, file_path, pages')
        .eq('id', selection.versionId)
        .eq('chapter_id', selection.chapterId)
        .single();

      if (versionError || !version) {
        return NextResponse.json(
          { error: `Version not found: ${selection.versionId}` },
          { status: 404 }
        );
      }

      selections.push({
        chapterId: chapter.id,
        versionId: version.id,
        chapterOrder: chapter.chapter_order,
        chapterTitle: chapter.title,
        filePath: version.file_path,
      });
    }

    if (selections.length === 0) {
      return NextResponse.json(
        { error: 'No chapters selected for compilation' },
        { status: 400 }
      );
    }

    console.log('[COMPILE-API] Validated selections:', selections.length);

    // 3. Merge chapter documents
    const mergedBuffer = await mergeChapterVersions(selections, {
      includeCoverPage: body.options?.includeCoverPage || false,
      thesisTitle: thesis.title,
      customTitle: body.options?.customTitle,
    });

    console.log('[COMPILE-API] Documents merged successfully');

    // 4. Create a temporary thesis version ID for storage
    const tempVersionId = crypto.randomUUID();

    // 5. Upload merged document
    const storagePath = await uploadMergedDocument(mergedBuffer, thesisId, tempVersionId);

    console.log('[COMPILE-API] Uploaded merged document to:', storagePath);

    // 6. Calculate total pages (sum of individual chapter pages)
    const totalPages = selections.reduce((sum, sel) => {
      // We'll need to query the actual pages from chapter_versions
      return sum;
    }, 0);

    // Query actual pages
    const { data: versionsData } = await supabase
      .from('chapter_versions')
      .select('id, pages')
      .in('id', selections.map(s => s.versionId));

    const calculatedTotalPages = (versionsData || []).reduce((sum, v) => sum + (v.pages || 0), 0);

    // 7. Create thesis_version record
    const chaptersIncludedData = selections.map(s => ({
      chapterId: s.chapterId,
      versionId: s.versionId,
      chapterOrder: s.chapterOrder,
      chapterTitle: s.chapterTitle,
    }));

    // Get next version number
    const { data: maxVersionData } = await supabase
      .from('thesis_versions')
      .select('version_number')
      .eq('thesis_id', thesisId)
      .order('version_number', { ascending: false })
      .limit(1)
      .single();

    const nextVersionNumber = (maxVersionData?.version_number || 0) + 1;

    // Insert thesis version directly
    console.log('[COMPILE-API] Inserting thesis version with:', {
      thesis_id: thesisId,
      version_number: nextVersionNumber,
      file_path: storagePath,
      total_pages: calculatedTotalPages,
      chapters_included: chaptersIncludedData,
    });

    const { data: thesisVersion, error: createError } = await supabase
      .from('thesis_versions')
      .insert({
        thesis_id: thesisId,
        version_number: nextVersionNumber,
        file_path: storagePath,
        total_pages: calculatedTotalPages,
        chapters_included: chaptersIncludedData,
        metadata: {
          compiledAt: new Date().toISOString(),
          options: body.options || {},
        }
      })
      .select()
      .single();

    console.log('[COMPILE-API] Insert result:', { data: thesisVersion, error: createError });

    if (createError || !thesisVersion) {
      console.error('[COMPILE-API] Error creating thesis version:', createError);
      return NextResponse.json(
        { error: 'Failed to create thesis version record', details: createError },
        { status: 500 }
      );
    }

    console.log('[COMPILE-API] Created thesis version:', thesisVersion);

    // 8. Return success with download URL
    return NextResponse.json({
      success: true,
      thesisVersionId: thesisVersion.id,
      versionNumber: nextVersionNumber,
      downloadUrl: `/api/theses/${thesisId}/versions/${thesisVersion.id}/download`,
      metadata: {
        totalPages: calculatedTotalPages,
        chaptersIncluded: selections.length,
        compiledAt: new Date().toISOString(),
      },
    });

  } catch (error: any) {
    console.error('[COMPILE-API] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to compile thesis' },
      { status: 500 }
    );
  }
}
