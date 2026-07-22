'use client';

import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  PipelineOperation,
  OperationConfigs,
  OPERATION_METADATA
} from '@/lib/pipeline/types';

export const PIPELINE_OPERATIONS: PipelineOperation[] = [
  'adjust',
  'update',
  'improve',
  'adapt',
  'translate'
];

const MODELS: Record<string, string[]> = {
  openai: ['gpt-5.4-mini', 'gpt-5.4'],
  gemini: ['gemini-3-flash-preview', 'gemini-2.5-flash', 'gemini-2.5-pro'],
  grok: ['grok-4-1-fast-non-reasoning', 'grok-4-1-fast-reasoning'],
  anthropic: ['claude-sonnet-4-6', 'claude-opus-4-6', 'claude-haiku-4-5']
};

export function getDefaultProviders(op: PipelineOperation): string[] {
  switch (op) {
    case 'adjust':
      return ['gemini', 'openai', 'grok', 'anthropic'];
    case 'update':
      return ['gemini', 'anthropic', 'openai'];
    case 'improve':
      return ['gemini', 'openai', 'anthropic'];
    case 'adapt':
      return ['gemini', 'openai', 'anthropic'];
    case 'translate':
      return ['gemini', 'openai', 'anthropic'];
    default:
      return ['gemini', 'openai', 'anthropic'];
  }
}

export function getDefaultModel(provider: string): string {
  return (
    MODELS[provider]?.[0] ||
    (provider === 'gemini'
      ? 'gemini-3-flash-preview'
      : provider === 'anthropic'
        ? 'claude-sonnet-4-6'
        : 'gpt-5.4-mini')
  );
}

export function validateConfig(op: PipelineOperation, config: any): boolean {
  if (!config) return false;

  switch (op) {
    case 'adjust':
      return !!config.instructions?.trim();
    case 'update':
      return true;
    case 'improve':
      return true;
    case 'adapt':
      return !!config.style;
    case 'translate':
      return !!config.targetLanguage;
    default:
      return false;
  }
}

export function getConfigSummary(op: PipelineOperation, config: any): string {
  if (!config) return 'Não configurado';

  const defaultProviders = getDefaultProviders(op);
  const provider = config.provider || defaultProviders[0];
  const model = config.model || getDefaultModel(provider);

  switch (op) {
    case 'adjust':
      return `Criatividade: ${config.creativity || 5} | ${provider}/${model}`;
    case 'update':
      return config.useOfficialSources !== false
        ? `Fontes oficiais + ${provider}/${model}`
        : `${provider}/${model}`;
    case 'improve':
      return `${provider}/${model}`;
    case 'adapt':
      return `Estilo: ${config.style} | ${provider}/${model}`;
    case 'translate': {
      const sourceLang = config.sourceLanguage || 'auto';
      return `${sourceLang} → ${config.targetLanguage} | ${provider}/${model}`;
    }
    default:
      return '';
  }
}

export function buildNormalizedConfigs(
  orderedOps: PipelineOperation[],
  configs: Partial<OperationConfigs>
): Partial<OperationConfigs> {
  const normalizedConfigs = { ...configs } as Record<string, Record<string, unknown>>;
  orderedOps.forEach((op) => {
    if (!normalizedConfigs[op]) {
      normalizedConfigs[op] = {};
    }
    const config = normalizedConfigs[op];
    if (!config.provider || !config.model) {
      const defaultProviders = getDefaultProviders(op);
      config.provider = config.provider || defaultProviders[0];
      config.model = config.model || getDefaultModel(String(config.provider));
    }
  });
  return normalizedConfigs as Partial<OperationConfigs>;
}

export type OperationStepContentProps = {
  operation: PipelineOperation;
  config: any;
  onConfigChange: (key: string, value: any) => void;
};

export function OperationStepContent({
  operation,
  config,
  onConfigChange
}: OperationStepContentProps) {
  const metadata = OPERATION_METADATA[operation];

  return (
    <div className="space-y-4">
      <div className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        {metadata.description}
      </div>

      <div className="space-y-4">
        {operation === 'adjust' && (
          <AdjustFields config={config} onChange={onConfigChange} />
        )}
        {operation === 'update' && (
          <UpdateFields config={config} onChange={onConfigChange} />
        )}
        {operation === 'improve' && (
          <ImproveFields config={config} onChange={onConfigChange} />
        )}
        {operation === 'adapt' && (
          <AdaptFields config={config} onChange={onConfigChange} />
        )}
        {operation === 'translate' && (
          <TranslateFields config={config} onChange={onConfigChange} />
        )}
      </div>
    </div>
  );
}

function AdjustFields({ config, onChange }: any) {
  return (
    <>
      <div>
        <Label>Instruções *</Label>
        <Textarea
          placeholder="Ex: Revisar o capítulo 3, melhorar as frases, retirar tópicos sobre tema tal..."
          value={config?.instructions || ''}
          onChange={(e) => onChange('instructions', e.target.value)}
          rows={4}
          className="mt-1"
        />
      </div>
      <div>
        <Label>Criatividade da IA (0 = conservador, 10 = criativo)</Label>
        <input
          type="range"
          min="0"
          max="10"
          value={config?.creativity ?? 5}
          onChange={(e) => onChange('creativity', parseInt(e.target.value, 10))}
          className="w-full mt-2"
        />
        <p className="text-xs text-gray-500 mt-1">Nível: {config?.creativity ?? 5}</p>
      </div>
      <ModelSelector config={config} onChange={onChange} providers={['openai', 'gemini', 'grok', 'anthropic']} />
    </>
  );
}

function UpdateFields({ config, onChange }: any) {
  const useOfficial = config?.useOfficialSources !== false;
  return (
    <>
      <div className="p-3 border rounded bg-yellow-50 dark:bg-yellow-950/30 text-sm text-yellow-800 dark:text-yellow-200">
        Esta operação requer aprovação manual após a análise
      </div>
      <div className="flex items-start gap-3 p-3 border rounded bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
        <input
          type="checkbox"
          id="update-use-official"
          checked={useOfficial}
          onChange={(e) => onChange('useOfficialSources', e.target.checked)}
          className="mt-1 h-4 w-4 rounded border-gray-300"
        />
        <label htmlFor="update-use-official" className="text-sm text-blue-900 dark:text-blue-100 cursor-pointer flex-1">
          <span className="font-medium">Priorizar fontes oficiais</span>
          <span className="block text-blue-700 dark:text-blue-300 mt-0.5">
            Verificar leis e decretos em LexML, Senado Federal e Data.gov.br antes de usar IA. Recomendado para maior precisão.
          </span>
        </label>
      </div>
      <p className="text-xs text-amber-800 dark:text-amber-200">
        Com Claude, a verificação usa pesquisa na web (custo adicional por busca na Anthropic). É preciso habilitar web search no console Anthropic.
      </p>
      <ModelSelector config={config} onChange={onChange} providers={['gemini', 'anthropic', 'openai']} />
    </>
  );
}

function ImproveFields({ config, onChange }: any) {
  return (
    <>
      <div className="p-3 border rounded bg-yellow-50 dark:bg-yellow-950/30 text-sm text-yellow-800 dark:text-yellow-200">
        Esta operação requer aprovação manual após a análise
      </div>
      <ModelSelector config={config} onChange={onChange} providers={['openai', 'gemini', 'anthropic']} />
    </>
  );
}

function AdaptFields({ config, onChange }: any) {
  return (
    <>
      <div>
        <Label>Estilo de Adaptação *</Label>
        <Select value={config?.style || 'simplified'} onValueChange={(v) => onChange('style', v)}>
          <SelectTrigger className="mt-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="academic">Acadêmico</SelectItem>
            <SelectItem value="professional">Profissional</SelectItem>
            <SelectItem value="simplified">Simplificado</SelectItem>
            <SelectItem value="custom">Personalizado</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {config?.style === 'custom' && (
        <div>
          <Label>Público-Alvo</Label>
          <input
            type="text"
            placeholder="Ex: Estudantes de graduação"
            value={config?.targetAudience || ''}
            onChange={(e) => onChange('targetAudience', e.target.value)}
            className="w-full mt-1 px-3 py-2 border rounded bg-background"
          />
        </div>
      )}
      <ModelSelector config={config} onChange={onChange} providers={['openai', 'gemini', 'anthropic']} />
    </>
  );
}

function TranslateFields({ config, onChange }: any) {
  const LANGUAGES: Record<string, string> = {
    en: 'English',
    pt: 'Português',
    es: 'Español',
    fr: 'Français',
    de: 'Deutsch',
    it: 'Italiano'
  };

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>De (origem)</Label>
          <Select value={config?.sourceLanguage || 'auto'} onValueChange={(v) => onChange('sourceLanguage', v)}>
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto-detectar</SelectItem>
              {Object.entries(LANGUAGES).map(([code, name]) => (
                <SelectItem key={code} value={code}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Para (destino) *</Label>
          <Select value={config?.targetLanguage || ''} onValueChange={(v) => onChange('targetLanguage', v)}>
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(LANGUAGES).map(([code, name]) => (
                <SelectItem key={code} value={code}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <ModelSelector config={config} onChange={onChange} providers={['openai', 'gemini', 'grok', 'anthropic']} />
    </>
  );
}

function ModelSelector({
  config,
  onChange,
  providers
}: {
  config: any;
  onChange: any;
  providers: string[];
}) {
  const defaultProvider = providers[0];
  const currentProvider = config?.provider || defaultProvider;
  const currentModel = config?.model || MODELS[currentProvider]?.[0];

  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <Label>Provedor</Label>
        <Select
          value={currentProvider}
          onValueChange={(v) => {
            onChange('provider', v);
            onChange('model', MODELS[v]?.[0]);
          }}
        >
          <SelectTrigger className="mt-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {providers.map((p) => (
              <SelectItem key={p} value={p}>
                {p === 'anthropic' ? 'Claude' : p.charAt(0).toUpperCase() + p.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Modelo</Label>
        <Select value={currentModel} onValueChange={(v) => onChange('model', v)}>
          <SelectTrigger className="mt-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MODELS[currentProvider]?.map((m) => (
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
