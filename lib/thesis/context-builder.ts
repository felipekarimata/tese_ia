/**
 * Context Builder - Multi-Chapter RAG Context Construction
 *
 * Responsibilities:
 * - Load multiple chapter versions
 * - Search across all loaded chapters
 * - Return chunks with full metadata for adaptive citations
 * - Determine citation display mode based on context
 */

import { supabase } from '../supabase';
import { loadChapterVersion, searchChapterVersion } from './chapter-processor';
import type {
  ChunkWithContext,
  ContextConfig,
  ContextResult,
  CitationDisplayMode
} from './types';
import type { ChapterVersionInMemory } from '../state';
import { state } from '../state';

/**
 * Build context for RAG query from multiple chapter versions
 *
 * @param config - Context configuration (which chapters to include, etc)
 * @param query - Search query
 * @returns Context result with chunks and metadata
 */
export async function buildMultiChapterContext(
  config: ContextConfig,
  query: string
): Promise<ContextResult> {
  const { 
    chapter_version_ids, 
    top_k = 16, 
    top_k_per_version = 5,
    search_mode = 'bm25' 
  } = config;

  console.log(`[CONTEXT-BUILDER] Building context for ${chapter_version_ids.length} chapter versions`);
  console.log(`[CONTEXT-BUILDER] Query: "${query}"`);
  console.log(`[CONTEXT-BUILDER] Top-K per version: ${top_k_per_version}, Total Top-K: ${top_k}`);

  // 1. Load all chapter versions (with caching)
  const loadedVersions: ChapterVersionInMemory[] = [];
  for (const versionId of chapter_version_ids) {
    try {
      const version = await loadChapterVersion(versionId, state);
      loadedVersions.push(version);
    } catch (error: any) {
      console.error(`[CONTEXT-BUILDER] Failed to load version ${versionId}:`, error.message);
      // Continue with other versions
    }
  }

  if (loadedVersions.length === 0) {
    throw new Error('No chapter versions could be loaded');
  }

  console.log(`[CONTEXT-BUILDER] Loaded ${loadedVersions.length} versions into memory`);

  // 2. Fetch chapter metadata for each version
  const versionMetadata = await fetchVersionMetadata(loadedVersions.map(v => v.id));

  // 3. Search across all versions
  const allResults: ChunkWithContext[] = [];

  for (const version of loadedVersions) {
    const metadata = versionMetadata.get(version.id);
    if (!metadata) continue;

    // Search this version with per-version limit
    const chunks = searchChapterVersion(version, query, top_k_per_version);

    // Add metadata to chunks
    const chunksWithContext: ChunkWithContext[] = chunks.map(chunk => ({
      ...chunk,
      chapter_id: metadata.chapter_id,
      chapter_title: metadata.chapter_title,
      chapter_order: metadata.chapter_order,
      version_number: version.version_number,
      thesis_id: metadata.thesis_id,
      thesis_title: metadata.thesis_title
    }));

    allResults.push(...chunksWithContext);
  }

  // 4. Sort by relevance (BM25 score proxy: assume earlier results are better)
  // In a real implementation, you'd sort by actual BM25 scores
  const topResults = allResults.slice(0, top_k);

  console.log(`[CONTEXT-BUILDER] Found ${topResults.length} relevant chunks`);

  // 5. Build result
  const chaptersIncluded = Array.from(versionMetadata.values()).map(m => ({
    chapter_id: m.chapter_id,
    chapter_title: m.chapter_title,
    chapter_order: m.chapter_order,
    version_number: m.version_number
  }));

  return {
    chunks: topResults,
    total_chunks_searched: allResults.length,
    chapters_included: chaptersIncluded
  };
}

/**
 * Fetch metadata for chapter versions (chapter title, order, thesis title)
 */
async function fetchVersionMetadata(versionIds: string[]): Promise<Map<string, {
  chapter_id: string;
  chapter_title: string;
  chapter_order: number;
  version_number: number;
  thesis_id: string;
  thesis_title: string;
}>> {
  const { data: versionsData, error } = await supabase
    .from('chapter_versions')
    .select(`
      id,
      version_number,
      chapters:chapter_id (
        id,
        title,
        chapter_order,
        theses:thesis_id (
          id,
          title
        )
      )
    `)
    .in('id', versionIds);

  if (error) {
    console.error('[CONTEXT-BUILDER] Error fetching version metadata:', error);
    return new Map();
  }

  const metadataMap = new Map<string, any>();

  for (const v of versionsData || []) {
    const chapter = Array.isArray(v.chapters) ? v.chapters[0] : v.chapters;
    const thesis = chapter?.theses ? (Array.isArray(chapter.theses) ? chapter.theses[0] : chapter.theses) : null;

    if (chapter && thesis) {
      metadataMap.set(v.id, {
        chapter_id: chapter.id,
        chapter_title: chapter.title,
        chapter_order: chapter.chapter_order,
        version_number: v.version_number,
        thesis_id: thesis.id,
        thesis_title: thesis.title
      });
    }
  }

  return metadataMap;
}

/**
 * Determine citation display mode based on context
 *
 * @param contextsResult - Result from buildMultiChapterContext
 * @returns Citation display mode
 */
export function determineCitationMode(contextResult: ContextResult): CitationDisplayMode {
  const { chapters_included } = contextResult;

  // Single chapter context
  if (chapters_included.length === 1) {
    const chapter = chapters_included[0];

    // Single version of single chapter
    if (chapter.version_number === 1 || contextResult.chunks.every(c => c.version_number === chapter.version_number)) {
      return 'minimal'; // Just "pág 5"
    } else {
      return 'version'; // "Cap X vY, pág Z"
    }
  }

  // Multiple chapters
  const uniqueVersionNumbers = new Set(contextResult.chunks.map(c => c.version_number));

  // All chunks are from version 1 or same version
  if (uniqueVersionNumbers.size === 1) {
    return 'chapter'; // "Cap X, pág Y"
  }

  // Mixed versions
  return 'version'; // "Cap X vY, pág Z"
}

/**
 * Format citation based on display mode
 *
 * @param chunk - Chunk with context
 * @param mode - Display mode
 * @returns Formatted citation string
 */
export function formatCitation(chunk: ChunkWithContext, mode: CitationDisplayMode): string {
  switch (mode) {
    case 'minimal':
      return `pág ${chunk.page_from}${chunk.page_to !== chunk.page_from ? `-${chunk.page_to}` : ''}`;

    case 'chapter':
      return `Cap ${chunk.chapter_order}, pág ${chunk.page_from}${chunk.page_to !== chunk.page_from ? `-${chunk.page_to}` : ''}`;

    case 'version':
      return `Cap ${chunk.chapter_order} v${chunk.version_number}, pág ${chunk.page_from}${chunk.page_to !== chunk.page_from ? `-${chunk.page_to}` : ''}`;

    case 'full':
      return `"${chunk.thesis_title}" - Cap ${chunk.chapter_order}: ${chunk.chapter_title} (v${chunk.version_number}), pág ${chunk.page_from}${chunk.page_to !== chunk.page_from ? `-${chunk.page_to}` : ''}`;
  }
}

/**
 * Get full citation tooltip text
 *
 * @param chunk - Chunk with context
 * @returns Full citation details for tooltip
 */
export function getFullCitationTooltip(chunk: ChunkWithContext): string {
  return `${chunk.thesis_title || 'Tese'} > Capítulo ${chunk.chapter_order}: ${chunk.chapter_title} > Versão ${chunk.version_number} > Páginas ${chunk.page_from}${chunk.page_to !== chunk.page_from ? `-${chunk.page_to}` : ''}`;
}
