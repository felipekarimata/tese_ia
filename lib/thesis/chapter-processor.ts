/**
 * Chapter Processor - Handles document processing and chunk persistence
 *
 * Responsibilities:
 * - Download document from Supabase Storage
 * - Parse document (PDF/DOCX/TXT)
 * - Create chunks
 * - Persist chunks to database (chapter_chunks)
 * - Build BM25 index for search
 */

import { supabase } from '../supabase';
import { parseDocument } from '../parsers';
import { chunkText } from '../chunking';
import { buildIndex } from '../state';
import type { ChapterChunk } from './types';
import type { ChapterVersionInMemory } from '../state';
import elasticlunr from 'elasticlunr';

/**
 * Process a chapter version: parse, chunk, persist to DB
 *
 * @param versionId - ID of the chapter version to process
 * @returns ChapterVersionInMemory with chunks and BM25 index
 */
export async function processChapterVersion(
  versionId: string
): Promise<ChapterVersionInMemory> {
  console.log(`[CHAPTER-PROCESSOR] Processing version: ${versionId}`);

  // 1. Fetch version from database
  const { data: version, error: versionError } = await supabase
    .from('chapter_versions')
    .select('*')
    .eq('id', versionId)
    .single();

  if (versionError || !version) {
    throw new Error(`Version not found: ${versionId}`);
  }

  // 2. Check if chunks already exist in database
  const { data: existingChunks, error: chunksError } = await supabase
    .from('chapter_chunks')
    .select('*')
    .eq('chapter_version_id', versionId)
    .order('chunk_index', { ascending: true });

  if (chunksError) {
    throw new Error(`Failed to fetch existing chunks: ${chunksError.message}`);
  }

  let chunks: ChapterChunk[];
  let pages: number;

  // 3. If chunks exist, use them; otherwise, process document
  if (existingChunks && existingChunks.length > 0) {
    console.log(`[CHAPTER-PROCESSOR] Found ${existingChunks.length} existing chunks`);
    chunks = existingChunks.map(c => ({
      id: c.id,
      chapter_version_id: c.chapter_version_id,
      chunk_index: c.chunk_index,
      page_from: c.page_from,
      page_to: c.page_to,
      text: c.text,
      created_at: c.created_at
    }));
    pages = version.pages || 1;
  } else {
    console.log(`[CHAPTER-PROCESSOR] No existing chunks, processing document...`);

    // Download file from Storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('documents')
      .download(version.file_path);

    if (downloadError || !fileData) {
      throw new Error(`Failed to download file: ${downloadError?.message || 'Unknown error'}`);
    }

    // Convert Blob to Buffer
    const arrayBuffer = await fileData.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    console.log(`[CHAPTER-PROCESSOR] Downloaded file: ${version.file_path} (${buffer.length} bytes)`);

    // Parse document
    const fileName = version.file_path.split('/').pop() || 'document';
    const parseResult = await parseDocument(buffer, fileName);
    pages = parseResult.pages;

    console.log(`[CHAPTER-PROCESSOR] Parsed document: ${pages} pages, ${parseResult.text.length} characters`);

    // Create chunks
    const rawChunks = chunkText(parseResult.text, pages);

    console.log(`[CHAPTER-PROCESSOR] Created ${rawChunks.length} chunks`);

    // Persist chunks to database
    const chunksToInsert = rawChunks.map((chunk, index) => ({
      chapter_version_id: versionId,
      chunk_index: index,
      page_from: chunk.pageFrom,
      page_to: chunk.pageTo,
      text: chunk.text
    }));

    const { data: insertedChunks, error: insertError } = await supabase
      .from('chapter_chunks')
      .insert(chunksToInsert)
      .select();

    if (insertError || !insertedChunks) {
      throw new Error(`Failed to insert chunks: ${insertError?.message || 'Unknown error'}`);
    }

    console.log(`[CHAPTER-PROCESSOR] Persisted ${insertedChunks.length} chunks to database`);

    chunks = insertedChunks.map(c => ({
      id: c.id,
      chapter_version_id: c.chapter_version_id,
      chunk_index: c.chunk_index,
      page_from: c.page_from,
      page_to: c.page_to,
      text: c.text,
      created_at: c.created_at
    }));

    // Update version with pages and chunks_count
    const { error: updateError } = await supabase
      .from('chapter_versions')
      .update({
        pages,
        chunks_count: chunks.length
      })
      .eq('id', versionId);

    if (updateError) {
      console.warn(`[CHAPTER-PROCESSOR] Failed to update version metadata: ${updateError.message}`);
    }

    console.log(`[CHAPTER-PROCESSOR] Updated version metadata: ${pages} pages, ${chunks.length} chunks`);
  }

  // 4. Build BM25 index
  const index = buildChapterIndex(chunks);

  console.log(`[CHAPTER-PROCESSOR] Built BM25 index for version: ${versionId}`);

  // 5. Return in-memory version
  return {
    id: version.id,
    chapter_id: version.chapter_id,
    version_number: version.version_number,
    file_path: version.file_path,
    pages,
    chunks,
    index,
    metadata: version.metadata || {},
    created_at: version.created_at
  };
}

/**
 * Build BM25 index for chapter chunks
 */
function buildChapterIndex(chunks: ChapterChunk[]): elasticlunr.Index<any> {
  const index = elasticlunr<any>(function (this: any) {
    this.addField('text');
    this.setRef('chunk_index');
  });

  chunks.forEach((chunk) => {
    index.addDoc({
      chunk_index: chunk.chunk_index,
      text: chunk.text,
      page_from: chunk.page_from,
      page_to: chunk.page_to
    });
  });

  return index;
}

/**
 * Load chapter version into memory (with caching)
 *
 * @param versionId - ID of the chapter version
 * @param state - Global state object for caching
 * @returns ChapterVersionInMemory
 */
export async function loadChapterVersion(
  versionId: string,
  state: { chapterVersions: Map<string, ChapterVersionInMemory> }
): Promise<ChapterVersionInMemory> {
  // Check if already loaded
  if (state.chapterVersions.has(versionId)) {
    console.log(`[CHAPTER-PROCESSOR] Version ${versionId} already in memory`);
    return state.chapterVersions.get(versionId)!;
  }

  // Process and cache
  const versionInMemory = await processChapterVersion(versionId);
  state.chapterVersions.set(versionId, versionInMemory);

  return versionInMemory;
}

/**
 * Search across chapter version chunks
 *
 * @param versionInMemory - Loaded chapter version with index
 * @param query - Search query
 * @param topK - Number of results to return
 * @returns Top matching chunks
 */
export function searchChapterVersion(
  versionInMemory: ChapterVersionInMemory,
  query: string,
  topK: number = 8
): ChapterChunk[] {
  const results = versionInMemory.index.search(query, {
    fields: {
      text: { boost: 1 }
    }
  });

  const topResults = results.slice(0, topK);
  const topChunks = topResults
    .map((r) => versionInMemory.chunks.find((c) => c.chunk_index === parseInt(r.ref)))
    .filter((c): c is ChapterChunk => c !== undefined);

  return topChunks;
}
