import { AIProvider } from '@/lib/ai/types';
import { DEFAULT_MODELS } from '@/lib/ai/model-registry';
import type { Multi3Settings } from './types';

export const MULTI3_PROVIDERS: AIProvider[] = ['openai', 'gemini', 'anthropic', 'grok'];

export const DEFAULT_MULTI3_SETTINGS: Multi3Settings = {
  defaultProviders: [...MULTI3_PROVIDERS],
  defaultModels: { ...DEFAULT_MODELS },
  judgeProvider: 'gemini',
};

export function multi3DefaultModel(provider: AIProvider): string {
  return DEFAULT_MODELS[provider];
}

/** Modelo por provedor — nunca reutiliza o modelo selecionado na UI de outro provedor. */
export function resolveMulti3Model(
  provider: AIProvider,
  settings?: {
    models?: Partial<Record<AIProvider, string[]>>;
    multi3?: Partial<Multi3Settings>;
  } | null
): string {
  const configuredDefault = settings?.multi3?.defaultModels?.[provider];
  const enabledModels = settings?.models?.[provider] ?? [];
  if (
    configuredDefault &&
    !isWrongModelForProvider(provider, configuredDefault) &&
    (enabledModels.length === 0 || enabledModels.includes(configuredDefault))
  ) {
    return configuredDefault;
  }
  const fromSettings = settings?.models?.[provider]?.[0];
  if (fromSettings && !isWrongModelForProvider(provider, fromSettings)) return fromSettings;
  return multi3DefaultModel(provider);
}

export function resolveMulti3Models(
  providers: AIProvider[],
  settings?: {
    models?: Partial<Record<AIProvider, string[]>>;
    multi3?: Partial<Multi3Settings>;
  } | null,
  judgeProvider?: AIProvider
): Partial<Record<AIProvider, string>> {
  const models: Partial<Record<AIProvider, string>> = {};
  const modelProviders = Array.from(new Set([
    ...providers,
    ...(judgeProvider ? [judgeProvider] : []),
  ]));
  for (const p of modelProviders) {
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

export function normalizeMulti3Settings(
  incoming?: Partial<Multi3Settings> | null,
  enabledModels?: Partial<Record<AIProvider, string[]>>
): Multi3Settings {
  const requestedProviders = Array.isArray(incoming?.defaultProviders)
    ? incoming.defaultProviders.filter(
        (provider, index, list): provider is AIProvider =>
          MULTI3_PROVIDERS.includes(provider) && list.indexOf(provider) === index
      )
    : [];
  const defaultProviders = requestedProviders.length >= 2
    ? requestedProviders
    : [...DEFAULT_MULTI3_SETTINGS.defaultProviders];

  const defaultModels: Partial<Record<AIProvider, string>> = {};
  for (const provider of MULTI3_PROVIDERS) {
    const requested = incoming?.defaultModels?.[provider];
    const enabled = enabledModels?.[provider] ?? [];
    defaultModels[provider] =
      requested &&
      !isWrongModelForProvider(provider, requested) &&
      (enabled.length === 0 || enabled.includes(requested))
        ? requested
        : enabled.find((model) => !isWrongModelForProvider(provider, model)) ||
          multi3DefaultModel(provider);
  }

  const judgeProvider = incoming?.judgeProvider && MULTI3_PROVIDERS.includes(incoming.judgeProvider)
    ? incoming.judgeProvider
    : DEFAULT_MULTI3_SETTINGS.judgeProvider;

  return { defaultProviders, defaultModels, judgeProvider };
}
