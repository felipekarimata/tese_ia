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

export type Multi3Candidate = {
  provider: AIProvider;
  model: string;
  status: Multi3CandidateStatus;
  versionId?: string;
  versionIds?: string[];
  text?: string;
  jobIds?: string[];
  error?: string;
  branchIndex?: number;
  progress?: number;
  progressLabel?: string;
};

export type Multi3Session = {
  id: string;
  targetType: 'chapter' | 'document';
  targetId: string;
  command: Multi3Command;
  commandArgs: string;
  providers: AIProvider[];
  judgeProvider: AIProvider;
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
