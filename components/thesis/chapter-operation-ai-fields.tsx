'use client';

import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';

export type ChapterOpAIProvider = 'openai' | 'gemini' | 'grok' | 'anthropic';

export const FALLBACK_MODELS_BY_PROVIDER: Record<ChapterOpAIProvider, string[]> = {
  openai: ['gpt-5.4-mini', 'gpt-5.4'],
  gemini: ['gemini-3-flash-preview', 'gemini-2.5-flash', 'gemini-2.5-pro'],
  grok: ['grok-4-1-fast-non-reasoning', 'grok-4-1-fast-reasoning'],
  anthropic: ['claude-sonnet-4-6', 'claude-opus-4-6', 'claude-haiku-4-5']
};

export function modelsForProvider(
  settingsModels: Partial<Record<ChapterOpAIProvider, string[]>> | null | undefined,
  provider: ChapterOpAIProvider
): string[] {
  const fromSettings = settingsModels?.[provider];
  if (fromSettings?.length) return fromSettings;
  return FALLBACK_MODELS_BY_PROVIDER[provider];
}

type Props = {
  provider: ChapterOpAIProvider;
  model: string;
  onProviderChange: (p: ChapterOpAIProvider) => void;
  onModelChange: (m: string) => void;
  settingsModels?: Partial<Record<ChapterOpAIProvider, string[]>> | null;
  providers?: ChapterOpAIProvider[];
  disabled?: boolean;
};

const PROVIDER_LABEL: Record<ChapterOpAIProvider, string> = {
  openai: 'OpenAI',
  gemini: 'Gemini',
  grok: 'Grok',
  anthropic: 'Claude'
};

export function ChapterOperationAiFields({
  provider,
  model,
  onProviderChange,
  onModelChange,
  settingsModels,
  providers,
  disabled
}: Props) {
  const providerList = providers ?? ['openai', 'gemini', 'grok', 'anthropic'];
  const modelOptions = modelsForProvider(settingsModels, provider);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border rounded-lg p-3 bg-muted/30">
      <div className="space-y-2">
        <Label>Provedor de IA</Label>
        <Select
          value={provider}
          onValueChange={(v) => onProviderChange(v as ChapterOpAIProvider)}
          disabled={disabled}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {providerList.map((p) => (
              <SelectItem key={p} value={p}>
                {PROVIDER_LABEL[p]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Modelo</Label>
        <Select value={model} onValueChange={onModelChange} disabled={disabled}>
          <SelectTrigger>
            <SelectValue placeholder="Selecione o modelo" />
          </SelectTrigger>
          <SelectContent>
            {modelOptions.map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
