import { AIProvider } from '@/lib/ai/types';

const DEFAULT_MODELS: Record<AIProvider, string> = {
  gemini: 'gemini-2.5-flash',
  openai: 'gpt-5.4-mini',
  anthropic: 'claude-sonnet-4-6',
  grok: 'grok-3-mini',
};

export function multi3DefaultModel(provider: AIProvider): string {
  return DEFAULT_MODELS[provider];
}

/** Modelo por provedor — nunca reutiliza o modelo selecionado na UI de outro provedor. */
export function resolveMulti3Model(
  provider: AIProvider,
  settings?: { models?: Partial<Record<AIProvider, string[]>> } | null
): string {
  const fromSettings = settings?.models?.[provider]?.[0];
  if (fromSettings) return fromSettings;
  return multi3DefaultModel(provider);
}

export function resolveMulti3Models(
  providers: AIProvider[],
  settings?: { models?: Partial<Record<AIProvider, string[]>> } | null
): Partial<Record<AIProvider, string>> {
  const models: Partial<Record<AIProvider, string>> = {};
  for (const p of providers) {
    models[p] = resolveMulti3Model(p, settings);
  }
  return models;
}

/** Evita usar modelo de outro provedor (ex.: gpt-* no Gemini). */
export function isWrongModelForProvider(provider: AIProvider, model: string): boolean {
  const m = model.toLowerCase();
  if (provider === 'openai') return !(m.includes('gpt') || m.startsWith('o1') || m.startsWith('o3') || m.startsWith('o4'));
  if (provider === 'gemini') return !m.includes('gemini');
  if (provider === 'anthropic') return !m.includes('claude');
  if (provider === 'grok') return !m.includes('grok');
  return false;
}

export function sanitizeMulti3Models(
  providers: AIProvider[],
  models: Partial<Record<AIProvider, string>> = {}
): Partial<Record<AIProvider, string>> {
  const out: Partial<Record<AIProvider, string>> = {};
  for (const p of providers) {
    const m = models[p];
    out[p] = m && !isWrongModelForProvider(p, m) ? m : multi3DefaultModel(p);
  }
  return out;
}
