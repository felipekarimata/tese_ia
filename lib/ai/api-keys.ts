import type { AIProvider } from './types';

/** Resolve server-side provider keys without ever exposing them to the browser. */
export function getProviderApiKey(provider: AIProvider): string {
  const key = provider === 'openai'
    ? process.env.OPENAI_API_KEY
    : provider === 'gemini'
      ? process.env.GOOGLE_API_KEY
      : provider === 'anthropic'
        ? process.env.ANTHROPIC_API_KEY
        : process.env.XAI_API_KEY || process.env.GROK_API_KEY;

  if (!key) {
    const variable = provider === 'grok'
      ? 'XAI_API_KEY'
      : provider === 'gemini'
        ? 'GOOGLE_API_KEY'
        : `${provider.toUpperCase()}_API_KEY`;
    throw new Error(`Chave não configurada para ${provider} (${variable})`);
  }

  return key;
}
