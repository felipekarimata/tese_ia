import { NextRequest, NextResponse } from 'next/server';
import { state, buildIndex } from '@/lib/state';
import { parseDocument } from '@/lib/parsers';
import { chunkText } from '@/lib/chunking';
import { supabase } from '@/lib/supabase';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const { documentId, filePath, fileName, projectId } = await request.json();

    if (!documentId || !filePath) {
      return NextResponse.json(
        { error: 'Missing documentId or filePath' },
        { status: 400 }
      );
    }

    // Valida projectId se fornecido (agora no Supabase)
    if (projectId) {
      const { data: project } = await supabase
        .from('projects')
        .select('id')
        .eq('id', projectId)
        .single();

      if (!project) {
        return NextResponse.json(
          { error: 'Project not found' },
          { status: 404 }
        );
      }
    }

    // Download file from Supabase Storage
    console.log(`[INGEST] Downloading file from Storage: ${filePath}`);
    const { data: fileBlob, error: downloadError } = await supabase.storage
      .from('documents')
      .download(filePath);

    if (downloadError || !fileBlob) {
      console.error('[INGEST] Storage download error:', downloadError);
      return NextResponse.json(
        { error: `Failed to download file: ${downloadError?.message}` },
        { status: 500 }
      );
    }

    // Convert Blob to Buffer
    const arrayBuffer = await fileBlob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Parse document
    const { text, pages } = await parseDocument(buffer, fileName);

    // Chunk text
    const chunks = chunkText(text, pages);

    // Build search index
    const index = buildIndex(chunks);

    // Save metadata to Supabase DB
    const { error: dbError } = await supabase.from('documents').insert({
      id: documentId,
      project_id: projectId || null,
      title: fileName,
      pages,
      file_path: filePath,
      chunks_count: chunks.length,
    });

    if (dbError) {
      console.error('[INGEST] Database error:', dbError);
      return NextResponse.json(
        { error: `Database error: ${dbError.message}` },
        { status: 500 }
      );
    }

    // Store chunks in memory for fast RAG
    state.docs.set(documentId, {
      id: documentId,
      title: fileName,
      pages,
      pathTmp: filePath,
      chunks,
      index,
      projectId: projectId || undefined,
    });

    // Atualiza timestamp do projeto no Supabase
    if (projectId) {
      await supabase
        .from('projects')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', projectId);
    }

    console.log(`[INGEST] Document saved to DB and loaded in memory: ${documentId}`);
    console.log(`[INGEST] Total docs in memory: ${state.docs.size}`);
    console.log(`[INGEST] Chunks: ${chunks.length}`);

    return NextResponse.json({
      documentId,
      title: fileName,
      pages,
      chunksCount: chunks.length,
    });
  } catch (error: any) {
    console.error('Ingest error:', error);
    return NextResponse.json(
      { error: `Ingest failed: ${error.message}` },
      { status: 500 }
    );
  }
}
