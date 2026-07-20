import { Chunk } from '../state';

export type AIProvider = 'openai' | 'gemini' | 'grok' | 'anthropic';

export type Citation = {
  page: number;
  span: string;
};

export type AIResponse = {
  provider: AIProvider;
  model: string;
  text: string;
  citations: Citation[];
  latencyMs: number;
  tokensIn: number;
  tokensOut: number;
  costEstimatedUsd: number;
};

export type ChatRequest = {
  question: string;
  context: Chunk[];
  model: string;
  action?: 'translate' | 'suggest' | 'adapt' | 'update' | null;
};

export type AIExecutor = (
  request: ChatRequest,
  apiKey: string
) => Promise<AIResponse>;
