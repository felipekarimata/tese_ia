'use client';

import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DOCUMENT_SEND_MODE_LABELS,
  type DocumentSendMode,
} from '@/lib/document-processing/mode';
import type { AIProviderKey, AppSettings } from './use-settings-form';
import { cn } from '@/lib/utils';
import type { Multi3Settings } from '@/lib/multi-ai/types';
import { MULTI3_PROVIDERS, normalizeMulti3Settings } from '@/lib/multi-ai/models';

const PROVIDER_LABELS: Record<AIProviderKey, string> = {
  openai: 'OpenAI',
  gemini: 'Gemini',
  grok: 'Grok',
  anthropic: 'Claude (Anthropic)',
};

const PROVIDER_HAS_KEY: Record<AIProviderKey, keyof AppSettings> = {
  openai: 'hasOpenaiKey',
  gemini: 'hasGoogleKey',
  grok: 'hasXaiKey',
  anthropic: 'hasAnthropicKey',
};

type SectionProps = {
  compact?: boolean;
  idPrefix?: string;
};

type DocumentProcessingSectionProps = SectionProps & {
  settings: AppSettings | null;
  updateDocumentProcessing: (patch: Record<string, unknown>) => void;
  onResetDefaults?: () => void;
};

export function DocumentProcessingSection({
  settings,
  updateDocumentProcessing,
  onResetDefaults,
  compact = false,
  idPrefix = '',
}: DocumentProcessingSectionProps) {
  const documentModes = Object.entries(DOCUMENT_SEND_MODE_LABELS) as [DocumentSendMode, string][];

  return (
    <div className={cn('space-y-4', compact && 'space-y-3')}>
      <div>
        <p className={cn('font-semibold text-white', compact ? 'text-sm' : 'text-base')}>
          Envio de documento à IA
        </p>
        {!compact && (
          <p className="text-xs text-gray-500 mt-1">
            Chat, /perguntar e operações (traduzir, adaptar, ajustar, /todos)
          </p>
        )}
      </div>

      <div className="space-y-2">
        {documentModes.map(([mode, label]) => (
          <label
            key={mode}
            className={cn(
              'flex items-start gap-3 rounded-lg border cursor-pointer transition-colors',
              compact
                ? 'p-2 border-white/10 hover:bg-white/5'
                : 'p-3 border-white/10 hover:bg-muted/50'
            )}
          >
            <input
              type="radio"
              name={`${idPrefix}documentSendMode`}
              value={mode}
              checked={(settings?.documentProcessing?.mode || 'auto') === mode}
              onChange={() => updateDocumentProcessing({ mode })}
              className="mt-1"
            />
            <span className={cn('text-gray-300', compact ? 'text-xs' : 'text-sm')}>{label}</span>
          </label>
        ))}
      </div>

      <div className={cn('grid gap-3', compact ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-3')}>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}maxWholeChars`} className="text-xs text-gray-400">
            Limite doc. inteiro (chars)
          </Label>
          <Input
            id={`${idPrefix}maxWholeChars`}
            type="number"
            min={10000}
            max={500000}
            className="h-8 text-xs bg-white/5 border-white/10"
            value={settings?.documentProcessing?.maxWholeDocumentChars ?? 96000}
            onChange={(e) =>
              updateDocumentProcessing({ maxWholeDocumentChars: Number(e.target.value) || 96000 })
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}ragTopK`} className="text-xs text-gray-400">
            Trechos RAG (top-K)
          </Label>
          <Input
            id={`${idPrefix}ragTopK`}
            type="number"
            min={1}
            max={50}
            className="h-8 text-xs bg-white/5 border-white/10"
            value={settings?.documentProcessing?.ragTopK ?? 12}
            onChange={(e) =>
              updateDocumentProcessing({ ragTopK: Number(e.target.value) || 12 })
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}fullContextMax`} className="text-xs text-gray-400">
            Limite contexto completo
          </Label>
          <Input
            id={`${idPrefix}fullContextMax`}
            type="number"
            min={10000}
            max={500000}
            className="h-8 text-xs bg-white/5 border-white/10"
            value={settings?.documentProcessing?.fullContextMaxChars ?? 120000}
            onChange={(e) =>
              updateDocumentProcessing({ fullContextMaxChars: Number(e.target.value) || 120000 })
            }
          />
        </div>
      </div>

      {onResetDefaults && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-xs text-gray-400 hover:text-white h-7 px-2"
          onClick={onResetDefaults}
        >
          Restaurar padrões de envio
        </Button>
      )}
    </div>
  );
}

type ModelsSectionProps = SectionProps & {
  settings: AppSettings | null;
  availableModels: Record<AIProviderKey, string[]>;
  loadingModels: Record<string, boolean>;
  toggleModel: (provider: AIProviderKey, model: string) => void;
  loadAllModels: (provider: AIProviderKey) => void;
};

function ProviderModelsBlock({
  provider,
  settings,
  availableModels,
  loadingModels,
  toggleModel,
  loadAllModels,
  compact,
  idPrefix,
}: {
  provider: AIProviderKey;
} & ModelsSectionProps) {
  const hasKeyField = PROVIDER_HAS_KEY[provider];
  const hasKey = Boolean(settings?.[hasKeyField]);
  const models = availableModels[provider] || [];
  const selected = settings?.models?.[provider]?.length || 0;

  return (
    <div className={cn('space-y-2', provider !== 'openai' && 'border-t border-white/10 pt-4')}>
      <div className="flex items-center justify-between gap-2">
        <Label className={cn('font-semibold text-white', compact ? 'text-xs' : 'text-sm')}>
          {PROVIDER_LABELS[provider]}
        </Label>
        {hasKey && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-[10px] text-gray-400 hover:text-white px-2"
            onClick={() => loadAllModels(provider)}
            disabled={loadingModels[provider]}
          >
            {loadingModels[provider] ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              'Recarregar'
            )}
          </Button>
        )}
      </div>

      {loadingModels[provider] ? (
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Carregando modelos...
        </div>
      ) : models.length > 0 ? (
        <div className={cn('grid gap-2', compact ? 'grid-cols-1' : 'grid-cols-2')}>
          {models.map((model) => (
            <label
              key={model}
              className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white"
            >
              <input
                type="checkbox"
                id={`${idPrefix}${provider}-${model}`}
                checked={settings?.models?.[provider]?.includes(model) || false}
                onChange={() => toggleModel(provider, model)}
                className="rounded"
              />
              <span className="truncate">{model}</span>
            </label>
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-500">
          {hasKey
            ? 'Clique em Recarregar para listar modelos'
            : `Configure a chave ${PROVIDER_LABELS[provider]} nas configurações`}
        </p>
      )}
      <p className="text-[10px] text-gray-600">Selecionados: {selected}</p>
    </div>
  );
}

export function ModelsSection(props: ModelsSectionProps) {
  const providers: AIProviderKey[] = ['openai', 'gemini', 'grok', 'anthropic'];

  return (
    <div className="space-y-2">
      <div>
        <p className={cn('font-semibold text-white', props.compact ? 'text-sm' : 'text-base')}>
          Modelos disponíveis
        </p>
        {!props.compact && (
          <p className="text-xs text-gray-500 mt-1">
            Marque os modelos que aparecem nos seletores do agente
          </p>
        )}
      </div>
      {providers.map((provider) => (
        <ProviderModelsBlock key={provider} provider={provider} {...props} />
      ))}
    </div>
  );
}

type Multi3DefaultsSectionProps = SectionProps & {
  settings: AppSettings | null;
  updateMulti3: (patch: Partial<Multi3Settings>) => void;
};

export function Multi3DefaultsSection({
  settings,
  updateMulti3,
  compact = false,
  idPrefix = '',
}: Multi3DefaultsSectionProps) {
  const config = normalizeMulti3Settings(settings?.multi3, settings?.models);

  const toggleProvider = (provider: AIProviderKey) => {
    const selected = config.defaultProviders.includes(provider);
    if (selected && config.defaultProviders.length <= 2) return;
    updateMulti3({
      defaultProviders: selected
        ? config.defaultProviders.filter((item) => item !== provider)
        : [...config.defaultProviders, provider],
    });
  };

  return (
    <div className={cn('space-y-4', compact && 'space-y-3')}>
      <div>
        <p className={cn('font-semibold text-white', compact ? 'text-sm' : 'text-base')}>
          Padroes do Multi-IA `/3`
        </p>
        <p className="text-xs text-gray-500 mt-1">
          Usados por `/3`, `/revisar /3` e `/todos /3` quando o comando nao informa provedores.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {MULTI3_PROVIDERS.map((provider) => {
          const enabledModels = settings?.models?.[provider] ?? [];
          const currentModel = config.defaultModels[provider] || '';
          const modelOptions = Array.from(new Set([
            ...(currentModel ? [currentModel] : []),
            ...enabledModels,
          ]));
          const selected = config.defaultProviders.includes(provider);
          const cannotRemove = selected && config.defaultProviders.length <= 2;

          return (
            <div key={provider} className="rounded-lg border border-white/10 p-3 space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium text-white cursor-pointer">
                <input
                  id={`${idPrefix}multi3-provider-${provider}`}
                  type="checkbox"
                  checked={selected}
                  disabled={cannotRemove}
                  onChange={() => toggleProvider(provider)}
                  className="rounded"
                />
                {PROVIDER_LABELS[provider]}
                {config.judgeProvider === provider && (
                  <span className="text-[10px] text-yellow-400">juiz</span>
                )}
              </label>
              <Select
                value={currentModel}
                onValueChange={(model) => updateMulti3({
                  defaultModels: { ...config.defaultModels, [provider]: model },
                })}
              >
                <SelectTrigger className="h-8 text-xs bg-white/5 border-white/10">
                  <SelectValue placeholder="Selecione o modelo" />
                </SelectTrigger>
                <SelectContent>
                  {modelOptions.map((model) => (
                    <SelectItem key={model} value={model}>{model}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {enabledModels.length === 0 && (
                <p className="text-[10px] text-amber-400/80">
                  Nenhum modelo habilitado; sera usado o fallback {currentModel}.
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="space-y-1.5 max-w-sm">
        <Label className="text-xs text-gray-400">Provedor juiz</Label>
        <Select
          value={config.judgeProvider}
          onValueChange={(provider) => updateMulti3({ judgeProvider: provider as AIProviderKey })}
        >
          <SelectTrigger className="h-9 bg-white/5 border-white/10">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MULTI3_PROVIDERS.map((provider) => (
              <SelectItem key={provider} value={provider}>
                {PROVIDER_LABELS[provider]} - {config.defaultModels[provider]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <p className="text-xs text-gray-500">
        Comando padrao: {config.defaultProviders
          .map((provider) => `${provider}/${config.defaultModels[provider]}`)
          .join(' | ')}. Juiz: {config.judgeProvider}/{config.defaultModels[config.judgeProvider]}.
      </p>
    </div>
  );
}
