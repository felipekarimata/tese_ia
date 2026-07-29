import type { AIProvider } from './types';

export const DEFAULT_MODELS: Record<AIProvider, string> = {
  openai: 'gpt-5.6',
  gemini: 'gemini-3.5-flash',
  anthropic: 'claude-fable-5',
  grok: 'grok-4.5'
};

export const RECOMMENDED_MODELS: Record<AIProvider, string[]> = {
  openai: ['gpt-5.6', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna'],
  gemini: ['gemini-3.5-flash', 'gemini-3.6-flash', 'gemini-3.1-pro-preview', 'gemini-2.5-pro'],
  anthropic: ['claude-fable-5', 'claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5'],
  grok: ['grok-4.5']
};

export function getDefaultModel(provider: AIProvider): string {
  return DEFAULT_MODELS[provider];
}

