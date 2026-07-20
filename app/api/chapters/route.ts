import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { randomUUID } from 'crypto';
import { supabase } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/chapters - Create new chapter with upload
 *
 * FormData fields:
 * - file: File (required)
 * - thesisId: string (required)
 * - title: string (required)
 * - chapterOrder: number (optional - auto-assigned if not provided)
 */
export async function POST(request: NextRequest) {
  try {
    // Get form data
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const thesisId = formData.get('thesisId') as string;
    const title = formData.get('title') as string;
    const chapterOrderStr = formData.get('chapterOrder') as string | null;

    // Validation
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!thesisId || !title) {
      return NextResponse.json(
        { error: 'thesisId and title are required' },
        { status: 400 }
      );
    }

    // Validate file type
    const ext = path.extname(file.name).toLowerCase();
    if (!['.pdf', '.docx', '.txt'].includes(ext)) {
      return NextResponse.json(
        { error: 'Unsupported file type. Only PDF, DOCX, and TXT are allowed.' },
        { status: 400 }
      );
    }

    // Verify thesis exists
    const { data: thesis, error: thesisError } = await supabase
      .from('theses')
      .select('id')
      .eq('id', thesisId)
      .single();

    if (thesisError || !thesis) {
      return NextResponse.json(
        { error: 'Thesis not found' },
        { status: 404 }
      );
    }

    // Determine chapter order
    let chapterOrder: number;
    if (chapterOrderStr) {
      chapterOrder = parseInt(chapterOrderStr, 10);
      if (isNaN(chapterOrder) || chapterOrder < 1) {
        return NextResponse.json(
          { error: 'chapterOrder must be a positive integer' },
          { status: 400 }
        );
      }

      // Check if order is already taken
      const { data: existingChapter } = await supabase
        .from('chapters')
        .select('id')
        .eq('thesis_id', thesisId)
        .eq('chapter_order', chapterOrder)
        .single();

      if (existingChapter) {
        return NextResponse.json(
          { error: `Chapter order ${chapterOrder} is already taken in this thesis` },
          { status: 400 }
        );
      }
    } else {
      // Auto-assign next available order
      const { data: nextOrderData } = await supabase
        .rpc('get_next_chapter_order', { p_thesis_id: thesisId });

      chapterOrder = nextOrderData || 1;
    }

    console.log(`[CHAPTERS] Creating chapter: "${title}" (order: ${chapterOrder}) for thesis: ${thesisId}`);

    // Generate IDs
    const chapterId = randomUUID();
    const versionId = randomUUID();

    // Prepare file for upload
    const fileName = `${versionId}${ext}`;
    const storagePath = `theses/${thesisId}/chapters/${chapterId}/${fileName}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error('[CHAPTERS] Storage upload error:', uploadError);
      return NextResponse.json(
        { error: `Storage upload failed: ${uploadError.message}` },
        { status: 500 }
      );
    }

    console.log(`[CHAPTERS] File uploaded to Storage: ${storagePath}`);

    // Create chapter (without current_version_id initially)
    const { data: chapter, error: chapterError } = await supabase
      .from('chapters')
      .insert({
        id: chapterId,
        thesis_id: thesisId,
        title: title.trim(),
        chapter_order: chapterOrder,
        current_version_id: null
      })
      .select()
      .single();

    if (chapterError) {
      console.error('[CHAPTERS] Error creating chapter:', chapterError);
      // Cleanup: delete uploaded file
      await supabase.storage.from('documents').remove([storagePath]);
      throw chapterError;
    }

    console.log(`[CHAPTERS] Chapter created: ${chapter.id}`);

    // Create first version (v1) using helper function
    const { data: versionData, error: versionError } = await supabase
      .rpc('create_chapter_version', {
        p_chapter_id: chapterId,
        p_file_path: storagePath,
        p_pages: null, // Will be set during chunking
        p_chunks_count: null, // Will be set during chunking
        p_created_by_operation: 'upload',
        p_parent_version_id: null,
        p_metadata: { original_filename: file.name }
      });

    if (versionError) {
      console.error('[CHAPTERS] Error creating version:', versionError);
      // Cleanup: delete chapter and file
      await supabase.from('chapters').delete().eq('id', chapterId);
      await supabase.storage.from('documents').remove([storagePath]);
      throw versionError;
    }

    console.log(`[CHAPTERS] Version created: ${versionData} (v1) for chapter: ${chapterId}`);

    // Fetch the created version
    const { data: version, error: fetchError } = await supabase
      .from('chapter_versions')
      .select('*')
      .eq('chapter_id', chapterId)
      .eq('version_number', 1)
      .single();

    if (fetchError || !version) {
      console.error('[CHAPTERS] Error fetching created version:', fetchError);
      throw fetchError || new Error('Version not found after creation');
    }

    // Return response (chunking will happen lazily on first access)
    return NextResponse.json({
      chapter: {
        id: chapter.id,
        thesisId: chapter.thesis_id,
        title: chapter.title,
        chapterOrder: chapter.chapter_order,
        createdAt: chapter.created_at,
        updatedAt: chapter.updated_at
      },
      version: {
        id: version.id,
        versionNumber: version.version_number,
        filePath: version.file_path,
        pages: version.pages,
        chunksCount: version.chunks_count,
        createdByOperation: version.created_by_operation,
        metadata: version.metadata,
        createdAt: version.created_at
      }
    });
  } catch (error: any) {
    console.error('[CHAPTERS] Upload error:', error);
    return NextResponse.json(
      { error: `Failed to create chapter: ${error.message}` },
      { status: 500 }
    );
  }
}
