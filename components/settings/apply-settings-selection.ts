import type { AIProvider } from '@/lib/ai/types';
import type { AppSettings } from './use-settings-form';

const PROVIDER_PREFERENCE: AIProvider[] = ['gemini', 'anthropic', 'openai', 'grok'];

export function pickDefaultProviderAndModel(settings: AppSettings | null): {
  provider: AIProvider | null;
  model: string;
} {
  if (!settings?.models) return { provider: null, model: '' };

  for (const p of PROVIDER_PREFERENCE) {
    const models = settings.models[p];
    if (models && models.length > 0) {
      return { provider: p, model: models[0] };
    }
  }

  return { provider: null, model: '' };
}

/** Keep current selection if still valid; otherwise pick first available. */
export function reconcileProviderModel(
  settings: AppSettings | null,
  currentProvider: AIProvider,
  currentModel: string
): { provider: AIProvider; model: string } {
  const models = settings?.models?.[currentProvider];
  if (models?.includes(currentModel)) {
    return { provider: currentProvider, model: currentModel };
  }
  if (models && models.length > 0) {
    return { provider: currentProvider, model: models[0] };
  }
  const fallback = pickDefaultProviderAndModel(settings);
  if (fallback.provider) {
    return { provider: fallback.provider, model: fallback.model };
  }
  return { provider: currentProvider, model: currentModel };
}
