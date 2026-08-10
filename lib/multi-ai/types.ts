import { AIProvider } from '@/lib/ai/types';

export type Multi3Command =
  | '/ajustar'
  | '/adaptar'
  | '/revisar'
  | '/traduzir'
  | '/todos'
  | '/perguntar';

export type Multi3SessionStatus =
  | 'running'
  | 'processing'
  | 'candidates_ready'
  | 'judging'
  | 'awaiting_human'
  | 'accepted'
  | 'failed';

export type Multi3CandidateStatus = 'running' | 'completed' | 'failed';

export type Multi3CandidateRole = 'candidate' | 'judge-final';

export type Multi3TodosStage =
  | 'starting'
  | 'translate'
  | 'review'
  | 'improve'
  | 'finalize'
  | 'completed';

export type Multi3Candidate = {
  provider: AIProvider;
  model: string;
  status: Multi3CandidateStatus;
  /** Omitido em sessões antigas; nesses casos o item é um candidato normal. */
  role?: Multi3CandidateRole;
  versionId?: string;
  versionIds?: string[];
  text?: string;
  jobIds?: string[];
  error?: string;
  branchIndex?: number;
  progress?: number;
  progressLabel?: string;
  stage?: Multi3TodosStage;
  stageProgress?: number;
  currentBatch?: number;
  totalBatches?: number;
  /** Heartbeat persisted with the candidate so long-running sessions are not reclaimed. */
  updatedAt?: string;
  /** Stored inside the candidates JSON for backwards-compatible session persistence. */
  judgeModel?: string;
};

export type Multi3Settings = {
  defaultProviders: AIProvider[];
  defaultModels: Partial<Record<AIProvider, string>>;
  judgeProvider: AIProvider;
};

export type Multi3Session = {
  id: string;
  targetType: 'chapter' | 'document';
  targetId: string;
  command: Multi3Command;
  commandArgs: string;
  providers: AIProvider[];
  judgeProvider: AIProvider;
  judgeModel?: string;
  status: Multi3SessionStatus;
  candidates: Multi3Candidate[];
  winnerProvider?: AIProvider;
  winnerVersionId?: string;
  judgeReasoning?: string;
  judgeScores?: Record<string, number>;
  parentVersionId?: string;
  createdAt: string;
  completedAt?: string;
};

export type Multi3StartRequest = {
  providers: AIProvider[];
  judgeProvider?: AIProvider;
  command: Multi3Command;
  args?: string;
  versionId: string;
  models?: Partial<Record<AIProvider, string>>;
};

export type Multi3JudgeResult = {
  winnerProvider: AIProvider;
  reasoning: string;
  scores: Record<string, number>;
};

export const PROVIDER_ALIASES: Record<string, AIProvider> = {
  gemini: 'gemini',
  google: 'gemini',
  openai: 'openai',
  gpt: 'openai',
  chatgpt: 'openai',
  claude: 'anthropic',
  anthropic: 'anthropic',
  grok: 'grok',
  crok: 'grok',
  xai: 'grok',
};

export const DEFAULT_JUDGE_PROVIDER: AIProvider = 'gemini';
