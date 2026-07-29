import type { AIProvider } from '../types';

export type ResearchDepth = 'quick' | 'deep';
export type ResearchSourceType = 'official' | 'academic' | 'journal' | 'news' | 'web';

export type ResearchSource = {
  id: string;
  title: string;
  url: string;
  domain: string;
  sourceType: ResearchSourceType;
  publishedAt?: string;
  excerpt?: string;
  citedText?: string;
};

export type ResearchUsage = {
  inputTokens?: number;
  outputTokens?: number;
  searchCalls?: number;
};

export type ResearchResult = {
  provider: AIProvider;
  model: string;
  text: string;
  queries: string[];
  sources: ResearchSource[];
  usage?: ResearchUsage;
};

export type ResearchRequest = {
  provider: AIProvider;
  model: string;
  apiKey: string;
  topic: string;
  context?: string;
  depth?: ResearchDepth;
  preferredDomains?: string[];
};

