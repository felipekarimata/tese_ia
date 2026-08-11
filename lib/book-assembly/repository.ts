import { supabase } from '@/lib/supabase';
import type {
  BookAssemblyJob,
  BookAssemblyResumeStage,
  BookAssemblyStatus,
  BookChapterResult,
  BookEditorialPlan,
  BookFinalizationReport,
} from './types';
import { BOOK_ASSEMBLY_RUNNING_STATUSES } from './types';

const STALE_AFTER_MS = 5 * 60 * 1000;

export function normalizeBookAssemblyJob(row: any): BookAssemblyJob {
  const updatedAt = row.updated_at || row.created_at || new Date().toISOString();
  const stale = Date.now() - new Date(updatedAt).getTime() > STALE_AFTER_MS;
  const status = row.status as BookAssemblyStatus;

  return {
    id: row.id,
    thesisId: row.thesis_id,
    title: row.title,
    mode: row.mode,
    status,
    provider: row.provider || null,
    model: row.model || null,
    customInstructions: row.custom_instructions || '',
    includeCoverPage: Boolean(row.include_cover_page),
    chapterSelections: Array.isArray(row.chapter_selections) ? row.chapter_selections : [],
    editorialPlan: row.editorial_plan || null,
    chapterResults: Array.isArray(row.chapter_results) ? row.chapter_results : [],
    approvedSuggestionIds: Array.isArray(row.approved_suggestion_ids) ? row.approved_suggestion_ids : [],
    finalizationReport: row.finalization_report || null,
    progress: Number(row.progress || 0),
    progressLabel: row.progress_label || '',
    currentChapterIndex: Number(row.current_chapter_index || 0),
    resumeStage: row.resume_stage || null,
    resultThesisVersionId: row.result_thesis_version_id || null,
    errorMessage: row.error_message || null,
    createdAt: row.created_at,
    updatedAt,
    startedAt: row.started_at || null,
    completedAt: row.completed_at || null,
    canResume: status === 'failed' || (BOOK_ASSEMBLY_RUNNING_STATUSES.includes(status) && stale),
  };
}

export async function getBookAssemblyJob(jobId: string): Promise<BookAssemblyJob | null> {
  const { data, error } = await (supabase as any)
    .from('book_assembly_jobs')
    .select('*')
    .eq('id', jobId)
    .maybeSingle();
  if (error) throw new Error(`Falha ao carregar montagem: ${error.message}`);
  return data ? normalizeBookAssemblyJob(data) : null;
}

export async function listBookAssemblyJobs(thesisId: string): Promise<BookAssemblyJob[]> {
  const { data, error } = await (supabase as any)
    .from('book_assembly_jobs')
    .select('*')
    .eq('thesis_id', thesisId)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw new Error(`Falha ao listar montagens: ${error.message}`);
  return (data || []).map(normalizeBookAssemblyJob);
}

export type BookJobUpdate = {
  status?: BookAssemblyStatus;
  editorialPlan?: BookEditorialPlan | null;
  chapterResults?: BookChapterResult[];
  approvedSuggestionIds?: string[];
  finalizationReport?: BookFinalizationReport | null;
  progress?: number;
  progressLabel?: string;
  currentChapterIndex?: number;
  resumeStage?: BookAssemblyResumeStage | null;
  resultThesisVersionId?: string | null;
  errorMessage?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
};

export async function updateBookAssemblyJob(jobId: string, updates: BookJobUpdate): Promise<void> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.status !== undefined) patch.status = updates.status;
  if (updates.editorialPlan !== undefined) patch.editorial_plan = updates.editorialPlan;
  if (updates.chapterResults !== undefined) patch.chapter_results = updates.chapterResults;
  if (updates.approvedSuggestionIds !== undefined) patch.approved_suggestion_ids = updates.approvedSuggestionIds;
  if (updates.finalizationReport !== undefined) patch.finalization_report = updates.finalizationReport;
  if (updates.progress !== undefined) patch.progress = updates.progress;
  if (updates.progressLabel !== undefined) patch.progress_label = updates.progressLabel;
  if (updates.currentChapterIndex !== undefined) patch.current_chapter_index = updates.currentChapterIndex;
  if (updates.resumeStage !== undefined) patch.resume_stage = updates.resumeStage;
  if (updates.resultThesisVersionId !== undefined) patch.result_thesis_version_id = updates.resultThesisVersionId;
  if (updates.errorMessage !== undefined) patch.error_message = updates.errorMessage;
  if (updates.startedAt !== undefined) patch.started_at = updates.startedAt;
  if (updates.completedAt !== undefined) patch.completed_at = updates.completedAt;

  const { error } = await (supabase as any)
    .from('book_assembly_jobs')
    .update(patch)
    .eq('id', jobId);
  if (error) throw new Error(`Falha ao atualizar montagem: ${error.message}`);
}

export async function markBookJobFailed(
  jobId: string,
  resumeStage: BookAssemblyResumeStage,
  error: unknown
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  await updateBookAssemblyJob(jobId, {
    status: 'failed',
    resumeStage,
    errorMessage: message.slice(0, 4000),
    progressLabel: 'Processamento interrompido; a montagem pode ser retomada',
  });
}
