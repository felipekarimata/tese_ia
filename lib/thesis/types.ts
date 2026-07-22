/**
 * Types for Thesis System with Versioned Chapters
 * Corresponds to database schema in 010_create_thesis_system.sql
 */

// ============================================================================
// CORE TYPES
// ============================================================================

/**
 * Main container for a thesis/dissertation project
 */
export interface Thesis {
  id: string;
  title: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Chapter within a thesis, with ordering
 */
export interface Chapter {
  id: string;
  thesis_id: string;
  title: string;
  chapter_order: number; // 1, 2, 3...
  current_version_id: string | null; // Points to active version
  created_at: string;
  updated_at: string;
}

/**
 * Version history for each chapter
 */
export interface ChapterVersion {
  id: string;
  chapter_id: string;
  version_number: number; // 1, 2, 3...
  parent_version_id: string | null; // Tracks lineage
  file_path: string; // Supabase Storage path
  pages: number | null;
  chunks_count: number | null;
  created_by_operation: ChapterOperation; // How this version was created
  metadata: Record<string, any>; // Flexible metadata
  created_at: string;
}

/**
 * Persisted chunk for RAG with full metadata
 */
export interface ChapterChunk {
  id: string;
  chapter_version_id: string;
  chunk_index: number; // Position in document (0-based)
  page_from: number;
  page_to: number;
  text: string;
  created_at: string;
}

/**
 * Compiled/merged thesis version
 */
export interface ThesisVersion {
  id: string;
  thesis_id: string;
  version_number: number;
  file_path: string; // Supabase Storage path to compiled .docx
  total_pages: number | null;
  chapters_included: {
    chapterId: string;
    versionId: string;
    chapterOrder: number;
    chapterTitle: string;
  }[];
  metadata: Record<string, any>;
  created_at: string;
}

// ============================================================================
// ENUMS & CONSTANTS
// ============================================================================

/**
 * Operations that can create new chapter versions
 */
export type ChapterOperation =
  | 'upload'      // Initial upload
  | 'improve'     // Improvement suggestions
  | 'translate'   // Translation
  | 'adjust'      // Custom adjustments
  | 'adapt'       // Restructuring
  | 'update';     // Norm updates

export const CHAPTER_OPERATIONS: ChapterOperation[] = [
  'upload',
  'improve',
  'translate',
  'adjust',
  'adapt',
  'update',
];

// ============================================================================
// EXTENDED TYPES (With Relations)
// ============================================================================

/**
 * Thesis with chapter count and ordering info
 */
export interface ThesisSummary extends Thesis {
  chapter_count: number;
  first_chapter_order: number | null;
  last_chapter_order: number | null;
}

/**
 * Chapter with current version details
 */
export interface ChapterDetails extends Chapter {
  // Current version info
  current_version_id: string | null;
  version_number: number | null;
  file_path: string | null;
  pages: number | null;
  chunks_count: number | null;
  created_by_operation: ChapterOperation | null;
  metadata: Record<string, any> | null;
  version_created_at: string | null;
  total_versions: number;
}

/**
 * Chapter with all its versions
 */
export interface ChapterWithVersions extends Chapter {
  versions: ChapterVersion[];
  current_version: ChapterVersion | null;
}

/**
 * Thesis with all its chapters
 */
export interface ThesisWithChapters extends Thesis {
  chapters: ChapterWithVersions[];
}

/**
 * Chunk with full chapter/version context (for citations)
 */
export interface ChunkWithContext extends ChapterChunk {
  // Chapter info
  chapter_id: string;
  chapter_title: string;
  chapter_order: number;

  // Version info
  version_number: number;

  // Thesis info (optional)
  thesis_id?: string;
  thesis_title?: string;
}

// ============================================================================
// REQUEST/RESPONSE TYPES (API)
// ============================================================================

/**
 * Request to create a new thesis
 */
export interface CreateThesisRequest {
  title: string;
  description?: string;
}

/**
 * Request to update a thesis
 */
export interface UpdateThesisRequest {
  title?: string;
  description?: string;
}

/**
 * Request to create a new chapter
 */
export interface CreateChapterRequest {
  thesis_id: string;
  title: string;
  chapter_order?: number; // If not provided, will be auto-assigned
  file?: File; // Upload file (for form data)
}

/**
 * Request to update chapter metadata (not version)
 */
export interface UpdateChapterRequest {
  title?: string;
  chapter_order?: number;
}

/**
 * Request to reorder chapters
 */
export interface ReorderChaptersRequest {
  chapter_orders: {
    chapter_id: string;
    new_order: number;
  }[];
}

/**
 * Request to create a new chapter version
 */
export interface CreateVersionRequest {
  chapter_id: string;
  file_path: string;
  pages?: number;
  chunks_count?: number;
  created_by_operation: ChapterOperation;
  parent_version_id?: string;
  metadata?: Record<string, any>;
}

/**
 * Request to perform chapter operation with multi-chapter context
 */
export interface ChapterOperationRequest {
  // Context from other chapters (optional)
  context_version_ids?: string[];
}

/**
 * Request to improve a chapter
 */
export interface ImproveChapterRequest extends ChapterOperationRequest {
  provider: string;
  model: string;
}

/**
 * Request to adjust a chapter
 */
export interface AdjustChapterRequest extends ChapterOperationRequest {
  instructions: string;
  creativity: number;
  provider: string;
  model: string;
  use_grounding?: boolean;
}

/**
 * Request to adapt a chapter
 */
export interface AdaptChapterRequest extends ChapterOperationRequest {
  style: 'academic' | 'professional' | 'simplified' | 'custom';
  target_audience?: string;
  provider: string;
  model: string;
}

/**
 * Request to update a chapter
 */
export interface UpdateChapterRequest extends ChapterOperationRequest {
  provider: string;
  model: string;
}

/**
 * Context summary for displaying which chapters were used
 */
export interface OperationContextSummary {
  chapter_id: string;
  chapter_title: string;
  chapter_order: number;
  version_id: string;
  version_number: number;
}

// ============================================================================
// RAG CONTEXT TYPES
// ============================================================================

/**
 * Configuration for multi-chapter RAG context
 */
export interface ContextConfig {
  // Which chapter versions to include
  chapter_version_ids: string[];

  // How many chunks to retrieve per version
  top_k_per_version?: number; // Default: 5

  // Total chunks to retrieve across all versions
  top_k?: number; // Default: 16

  // Search mode
  search_mode?: 'bm25' | 'semantic'; // Default: bm25
}

/**
 * Context result for RAG query
 */
export interface ContextResult {
  chunks: ChunkWithContext[];
  total_chunks_searched: number;
  chapters_included: {
    chapter_id: string;
    chapter_title: string;
    chapter_order: number;
    version_number: number;
  }[];
}

// ============================================================================
// CITATION TYPES
// ============================================================================

/**
 * Citation format for displaying chunk sources
 */
export interface Citation {
  chunk_id: string;

  // Adaptive display (based on context)
  display_text: string; // "pág 5" or "Cap 1, pág 5" or "Cap 1 v2, pág 5"

  // Full metadata (for tooltip)
  full_context: {
    chapter_title: string;
    chapter_order: number;
    version_number: number;
    page_from: number;
    page_to: number;
    thesis_title?: string;
  };
}

/**
 * Citation display mode (determines how verbose citations are)
 */
export type CitationDisplayMode =
  | 'minimal'     // "pág 5" (single chapter, single version)
  | 'chapter'     // "Cap 1, pág 5" (multi-chapter, same versions)
  | 'version'     // "Cap 1 v2, pág 5" (mixed versions)
  | 'full';       // Always show everything

// ============================================================================
// VERSION COMPARISON TYPES
// ============================================================================

/**
 * Comparison between two versions
 */
export interface VersionComparison {
  version_a: ChapterVersion;
  version_b: ChapterVersion;

  // Stats
  pages_diff: number;
  chunks_diff: number;

  // Content diff (optional, for future implementation)
  diff?: {
    added_lines: number;
    removed_lines: number;
    changed_lines: number;
  };
}

// ============================================================================
// UI STATE TYPES
// ============================================================================

/**
 * Selected chapters for context in chat
 */
export interface ChapterSelection {
  chapter_id: string;
  version_id: string;
  title: string;
  chapter_order: number;
  version_number: number;
  is_current: boolean;
}

/**
 * Thesis tree node (for hierarchical display)
 */
export interface ThesisTreeNode {
  type: 'thesis' | 'chapter' | 'version';
  id: string;
  label: string;
  expanded?: boolean;
  children?: ThesisTreeNode[];

  // Node-specific data
  data?: Thesis | Chapter | ChapterVersion;
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

/**
 * Database insert type (without auto-generated fields)
 */
export type InsertThesis = Omit<Thesis, 'id' | 'created_at' | 'updated_at'>;
export type InsertChapter = Omit<Chapter, 'id' | 'created_at' | 'updated_at' | 'current_version_id'>;
export type InsertChapterVersion = Omit<ChapterVersion, 'id' | 'created_at'>;
export type InsertChapterChunk = Omit<ChapterChunk, 'id' | 'created_at'>;

/**
 * Pagination params
 */
export interface PaginationParams {
  page?: number;
  limit?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

/**
 * Paginated response
 */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}
