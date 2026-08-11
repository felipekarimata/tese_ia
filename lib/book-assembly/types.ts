import type { AIProvider } from '@/lib/ai/types';

export type BookAssemblyMode = 'compile' | 'harmonize' | 'structural';

export type BookAssemblyStatus =
  | 'queued'
  | 'analyzing'
  | 'awaiting_plan_approval'
  | 'harmonizing'
  | 'awaiting_changes_approval'
  | 'finalizing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type BookAssemblyResumeStage = 'analyzing' | 'harmonizing' | 'finalizing';

export type BookChapterSelection = {
  chapterId: string;
  versionId: string;
  order: number;
  chapterTitle: string;
  versionNumber: number;
  filePath: string;
  pages: number | null;
};

export type BookChapterSummary = {
  chapterId: string;
  title: string;
  order: number;
  role: string;
  summary: string;
  openingFocus: string;
  endingFocus: string;
  keyConcepts: string[];
};

export type BookChapterGuidance = {
  chapterId: string;
  title: string;
  role: string;
  preserve: string[];
  recommendedChanges: string[];
  transitionIn: string;
  transitionOut: string;
};

export type BookEditorialPlan = {
  overview: string;
  centralThesis: string;
  proposedStructure: string;
  terminology: Array<{ preferred: string; avoid: string[]; note: string }>;
  globalIssues: Array<{
    type: 'repetition' | 'continuity' | 'terminology' | 'gap' | 'structure' | 'other';
    description: string;
    chapters: string[];
  }>;
  chapterGuidance: BookChapterGuidance[];
  proposedAdditions: string[];
  chapterSummaries: BookChapterSummary[];
  rawResponse?: string;
};

export type BookSuggestionKind =
  | 'transition'
  | 'terminology'
  | 'repetition'
  | 'cohesion'
  | 'structure'
  | 'addition'
  | 'language';

export type BookSuggestion = {
  id: string;
  chapterId: string;
  chapterTitle: string;
  paragraphIndex: number;
  occurrenceIndex: number;
  originalText: string;
  improvedText: string;
  reason: string;
  kind: BookSuggestionKind;
};

export type BookChapterResult = {
  chapterId: string;
  chapterTitle: string;
  order: number;
  paragraphCount: number;
  chunksProcessed: number;
  chunksFailed: number;
  suggestions: BookSuggestion[];
  warnings: string[];
};

export type BookFinalizationReport = {
  requestedSuggestions: number;
  appliedSuggestions: number;
  unmatchedSuggestions: number;
  chaptersProcessed: number;
};

export type BookAssemblyJob = {
  id: string;
  thesisId: string;
  title: string;
  mode: BookAssemblyMode;
  status: BookAssemblyStatus;
  provider: AIProvider | null;
  model: string | null;
  customInstructions: string;
  includeCoverPage: boolean;
  chapterSelections: BookChapterSelection[];
  editorialPlan: BookEditorialPlan | null;
  chapterResults: BookChapterResult[];
  approvedSuggestionIds: string[];
  finalizationReport: BookFinalizationReport | null;
  progress: number;
  progressLabel: string;
  currentChapterIndex: number;
  resumeStage: BookAssemblyResumeStage | null;
  resultThesisVersionId: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  canResume: boolean;
};

export type CreateBookAssemblyInput = {
  title: string;
  mode: BookAssemblyMode;
  provider?: AIProvider;
  model?: string;
  customInstructions?: string;
  includeCoverPage?: boolean;
  chapterSelections: Array<{
    chapterId: string;
    versionId: string;
    order: number;
  }>;
};

export const BOOK_ASSEMBLY_RUNNING_STATUSES: BookAssemblyStatus[] = [
  'queued',
  'analyzing',
  'harmonizing',
  'finalizing',
];

export function isBookAssemblyMode(value: unknown): value is BookAssemblyMode {
  return value === 'compile' || value === 'harmonize' || value === 'structural';
}

export function isAIProvider(value: unknown): value is AIProvider {
  return value === 'openai' || value === 'gemini' || value === 'anthropic' || value === 'grok';
}
