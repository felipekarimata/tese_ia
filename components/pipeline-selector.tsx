'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Loader2, Rocket } from 'lucide-react';
import { PipelineOperation, OperationConfigs, OPERATION_METADATA } from '@/lib/pipeline/types';
import { getAIErrorMessage } from '@/lib/ai-error-message';

type PipelineSelectorProps = {
  documentId: string;
  documentTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function PipelineSelector({ documentId, documentTitle, open, onOpenChange }: PipelineSelectorProps) {
  const router = useRouter();
  const [selectedOps, setSelectedOps] = useState<Set<PipelineOperation>>(new Set());
  const [configs, setConfigs] = useState<Partial<OperationConfigs>>({});
  const [isStarting, setIsStarting] = useState(false);

  const toggleOperation = (op: PipelineOperation) => {
    const newSelected = new Set(selectedOps);
    if (newSelected.has(op)) {
      newSelected.delete(op);
      // Remove config
      const newConfigs = { ...configs };
      delete newConfigs[op];
      setConfigs(newConfigs);
    } else {
      newSelected.add(op);
      // Add default config
      setConfigs({
        ...configs,
        [op]: getDefaultConfig(op)
      });
    }
    setSelectedOps(newSelected);
  };

  const updateConfig = (op: PipelineOperation, key: string, value: any) => {
    setConfigs({
      ...configs,
      [op]: {
        ...configs[op],
        [key]: value
      }
    });
  };

  const handleStartPipeline = async () => {
    if (selectedOps.size === 0) {
      toast.error('Selecione pelo menos uma operação');
      return;
    }

    // Validate configs
    for (const op of selectedOps) {
      if (!validateConfig(op, configs[op])) {
        toast.error(`Configuração incompleta para: ${OPERATION_METADATA[op].name}`);
        return;
      }
    }

    try {
      setIsStarting(true);

      // Build operations array in fixed order
      const orderedOps: PipelineOperation[] = ['adjust', 'update', 'improve', 'adapt', 'translate'].filter(op =>
        selectedOps.has(op as PipelineOperation)
      ) as PipelineOperation[];

      const res = await fetch('/api/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId,
          operations: orderedOps,
          configs
        })
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Falha ao iniciar pipeline');
      }

      const data = await res.json();
      toast.success('Pipeline iniciado!');

      // Redirect to pipeline page
      setTimeout(() => {
        router.push(`/pipeline/${data.jobId}`);
      }, 500);

    } catch (error: any) {
      console.error('Pipeline start error:', error);
      toast.error(getAIErrorMessage(error, 'Falha ao iniciar pipeline'));
      setIsStarting(false);
    }
  };

  const estimatedTime = Array.from(selectedOps).reduce((total, op) => {
    return total + (OPERATION_METADATA[op]?.estimatedMinutes || 0);
  }, 0);

  const estimatedCost = selectedOps.size * 0.05; // Rough estimate

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">🎯 Processar Documento</DialogTitle>
          <DialogDescription>
            Selecione as operações que deseja executar. Elas serão executadas em sequência ⚡
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Operations */}
          <OperationCard
            operation="adjust"
            selected={selectedOps.has('adjust')}
            onToggle={() => toggleOperation('adjust')}
            config={configs.adjust}
            onConfigChange={(key, value) => updateConfig('adjust', key, value)}
          />

          {selectedOps.has('adjust') && <FlowArrow />}

          <OperationCard
            operation="update"
            selected={selectedOps.has('update')}
            onToggle={() => toggleOperation('update')}
            config={configs.update}
            onConfigChange={(key, value) => updateConfig('update', key, value)}
          />

          {selectedOps.has('update') && <FlowArrow />}

          <OperationCard
            operation="improve"
            selected={selectedOps.has('improve')}
            onToggle={() => toggleOperation('improve')}
            config={configs.improve}
            onConfigChange={(key, value) => updateConfig('improve', key, value)}
          />

          {selectedOps.has('improve') && <FlowArrow />}

          <OperationCard
            operation="adapt"
            selected={selectedOps.has('adapt')}
            onToggle={() => toggleOperation('adapt')}
            config={configs.adapt}
            onConfigChange={(key, value) => updateConfig('adapt', key, value)}
          />

          {selectedOps.has('adapt') && <FlowArrow />}

          <OperationCard
            operation="translate"
            selected={selectedOps.has('translate')}
            onToggle={() => toggleOperation('translate')}
            config={configs.translate}
            onConfigChange={(key, value) => updateConfig('translate', key, value)}
          />

          {/* Summary */}
          {selectedOps.size > 0 && (
            <div className="border rounded-lg p-4 bg-gradient-to-br from-white/5 to-white/[0.02] backdrop-blur-xl">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                📊 Resumo do Pipeline
              </h3>
              <div className="space-y-2 text-sm text-gray-400">
                <p>✓ {selectedOps.size} operaç{selectedOps.size === 1 ? 'ão' : 'ões'} selecionada{selectedOps.size === 1 ? '' : 's'}</p>
                <p>⏱️ Tempo estimado: ~{estimatedTime}-{estimatedTime + 5} min</p>
                <p>💰 Custo estimado: ~${estimatedCost.toFixed(2)}</p>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isStarting}>
              Cancelar
            </Button>
            <Button
              onClick={handleStartPipeline}
              disabled={selectedOps.size === 0 || isStarting}
              className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white"
            >
              {isStarting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Iniciando...
                </>
              ) : (
                <>
                  <Rocket className="w-4 h-4 mr-2" />
                  Iniciar Pipeline ({selectedOps.size} ops)
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================
// Operation Card Component
// ============================================

type OperationCardProps = {
  operation: PipelineOperation;
  selected: boolean;
  onToggle: () => void;
  config: any;
  onConfigChange: (key: string, value: any) => void;
};

function OperationCard({ operation, selected, onToggle, config, onConfigChange }: OperationCardProps) {
  const metadata = OPERATION_METADATA[operation];

  const colorClasses = {
    adjust: 'border-red-500/30 bg-red-500/10',
    update: 'border-blue-500/30 bg-blue-500/10',
    improve: 'border-green-500/30 bg-green-500/10',
    adapt: 'border-purple-500/30 bg-purple-500/10',
    translate: 'border-yellow-500/30 bg-yellow-500/10'
  };

  return (
    <div className={`border rounded-lg p-4 transition-all ${selected ? colorClasses[operation] : 'border-white/10'}`}>
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          className="mt-1"
        />
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl">{metadata.icon}</span>
            <h4 className="font-semibold text-lg">{metadata.name}</h4>
          </div>
          <p className="text-sm text-gray-400 mb-3">{metadata.description}</p>

          {/* Operation-specific configs */}
          {selected && (
            <div className="space-y-3 mt-4">
              {operation === 'adjust' && (
                <AdjustConfig config={config} onChange={onConfigChange} />
              )}
              {operation === 'update' && (
                <UpdateConfig config={config} onChange={onConfigChange} />
              )}
              {operation === 'improve' && (
                <ImproveConfig config={config} onChange={onConfigChange} />
              )}
              {operation === 'adapt' && (
                <AdaptConfig config={config} onChange={onConfigChange} />
              )}
              {operation === 'translate' && (
                <TranslateConfig config={config} onChange={onConfigChange} />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================
// Config Components
// ============================================

function AdjustConfig({ config, onChange }: any) {
  return (
    <>
      <div>
        <Label>Instruções</Label>
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
          value={config?.creativity || 5}
          onChange={(e) => onChange('creativity', parseInt(e.target.value))}
          className="w-full mt-2"
        />
        <p className="text-xs text-gray-500 mt-1">Nível: {config?.creativity || 5}</p>
      </div>
      <ModelSelector config={config} onChange={onChange} providers={['openai', 'gemini', 'grok', 'anthropic']} />
    </>
  );
}

function UpdateConfig({ config, onChange }: any) {
  return <ModelSelector config={config} onChange={onChange} providers={['gemini', 'anthropic', 'openai']} />;
}

function ImproveConfig({ config, onChange }: any) {
  return <ModelSelector config={config} onChange={onChange} providers={['openai', 'gemini', 'anthropic']} />;
}

function AdaptConfig({ config, onChange }: any) {
  return (
    <>
      <div>
        <Label>Estilo de Adaptação</Label>
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
            className="w-full mt-1 px-3 py-2 border rounded"
          />
        </div>
      )}
      <ModelSelector config={config} onChange={onChange} providers={['openai', 'gemini', 'anthropic']} />
    </>
  );
}

function TranslateConfig({ config, onChange }: any) {
  const LANGUAGES = {
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
                <SelectItem key={code} value={code}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Para (destino)</Label>
          <Select value={config?.targetLanguage || ''} onValueChange={(v) => onChange('targetLanguage', v)}>
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(LANGUAGES).map(([code, name]) => (
                <SelectItem key={code} value={code}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <ModelSelector config={config} onChange={onChange} providers={['openai', 'gemini', 'grok', 'anthropic']} />
    </>
  );
}

function ModelSelector({ config, onChange, providers }: { config: any; onChange: any; providers: string[] }) {
  const MODELS: Record<string, string[]> = {
    openai: ['gpt-5.4-mini', 'gpt-5.4'],
    gemini: ['gemini-3-flash-preview', 'gemini-2.5-flash', 'gemini-2.5-pro'],
    grok: ['grok-4-1-fast-non-reasoning', 'grok-4-1-fast-reasoning'],
    anthropic: ['claude-sonnet-4-6', 'claude-opus-4-6', 'claude-haiku-4-5']
  };

  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <Label>Provedor</Label>
        <Select value={config?.provider || providers[0]} onValueChange={(v) => onChange('provider', v)}>
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
        <Select
          value={config?.model || MODELS[config?.provider || providers[0]]?.[0]}
          onValueChange={(v) => onChange('model', v)}
        >
          <SelectTrigger className="mt-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MODELS[config?.provider || providers[0]]?.map((m) => (
              <SelectItem key={m} value={m}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function FlowArrow() {
  return (
    <div className="flex justify-center py-2">
      <div className="text-gray-500 text-2xl">↓</div>
    </div>
  );
}

// ============================================
// Helper Functions
// ============================================

function getDefaultConfig(op: PipelineOperation): any {
  switch (op) {
    case 'adjust':
      return { instructions: '', creativity: 5, provider: 'openai', model: 'gpt-5.4-mini' };
    case 'update':
      return { provider: 'gemini', model: 'gemini-3-flash-preview' };
    case 'improve':
      return { provider: 'openai', model: 'gpt-5.4-mini' };
    case 'adapt':
      return { style: 'simplified', provider: 'openai', model: 'gpt-5.4-mini' };
    case 'translate':
      return {
        sourceLanguage: 'auto',
        targetLanguage: '',
        provider: 'gemini',
        model: 'gemini-3-flash-preview'
      };
  }
}

function validateConfig(op: PipelineOperation, config: any): boolean {
  if (!config) return false;

  switch (op) {
    case 'adjust':
      return !!config.instructions && !!config.provider && !!config.model;
    case 'update':
      return !!config.provider && !!config.model;
    case 'improve':
      return !!config.provider && !!config.model;
    case 'adapt':
      return !!config.style && !!config.provider && !!config.model;
    case 'translate':
      return !!config.targetLanguage && !!config.provider && !!config.model;
    default:
      return false;
  }
}
