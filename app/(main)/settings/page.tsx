'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Save, CheckCircle, XCircle, Loader2, AlertCircle } from 'lucide-react';
import { getAIErrorMessage } from '@/lib/ai-error-message';
import { DocumentProcessingSection, ModelsSection } from '@/components/settings/settings-form-sections';
import { SkillsSection } from '@/components/settings/skills-section';
import { useSettingsForm, type PendingKeyUpdates } from '@/components/settings/use-settings-form';
import { dispatchSettingsUpdated } from '@/components/settings/events';

const KEY_PROVIDERS = [
  {
    id: 'openai' as const,
    field: 'openaiKey' as const,
    hasField: 'hasOpenaiKey' as const,
    label: 'OpenAI API Key',
    placeholder: 'sk-...',
  },
  {
    id: 'gemini' as const,
    field: 'googleKey' as const,
    hasField: 'hasGoogleKey' as const,
    label: 'Google API Key (Gemini)',
    placeholder: 'AIza...',
  },
  {
    id: 'grok' as const,
    field: 'xaiKey' as const,
    hasField: 'hasXaiKey' as const,
    label: 'xAI API Key (Grok)',
    placeholder: 'xai-...',
  },
  {
    id: 'anthropic' as const,
    field: 'anthropicKey' as const,
    hasField: 'hasAnthropicKey' as const,
    label: 'Anthropic API Key (Claude)',
    placeholder: 'sk-ant-...',
  },
];

export default function SettingsPage() {
  const [mounted, setMounted] = useState(false);
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [testResults, setTestResults] = useState<Record<string, 'success' | 'error' | null>>({});

  const {
    settings,
    pendingKeys,
    setPendingKey,
    loading,
    saving,
    loadingModels,
    availableModels,
    updateDocumentProcessing,
    resetDocumentProcessingDefaults,
    toggleModel,
    loadAllModels,
    saveSettings,
    setSkillOverride,
    clearSkillOverride,
    updateSkills,
  } = useSettingsForm();

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleSave = async () => {
    const ok = await saveSettings(false);
    if (ok) {
      toast.success('Configurações salvas com sucesso!');
      dispatchSettingsUpdated();
    }
  };

  const handleTest = async (provider: 'openai' | 'gemini' | 'grok' | 'anthropic') => {
    setTesting((prev) => ({ ...prev, [provider]: true }));
    setTestResults((prev) => ({ ...prev, [provider]: null }));

    try {
      const res = await fetch('/api/settings/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      });

      if (!res.ok) throw new Error('Teste falhou');

      const data = await res.json();
      setTestResults((prev) => ({ ...prev, [provider]: 'success' }));
      toast.success(
        `${provider === 'anthropic' ? 'Claude' : provider.toUpperCase()} conectado! Latência: ${data.latencyMs}ms`
      );
    } catch (error: any) {
      setTestResults((prev) => ({ ...prev, [provider]: 'error' }));
      toast.error(
        `${provider === 'anthropic' ? 'Claude' : provider.toUpperCase()}: ${getAIErrorMessage(error, 'Não foi possível conectar')}`
      );
    } finally {
      setTesting((prev) => ({ ...prev, [provider]: false }));
    }
  };

  if (!mounted || loading) {
    return (
      <div className="text-center py-12">
        <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
        <p className="text-muted-foreground mt-4">Carregando configurações...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold">Configurações</h1>
        <p className="text-muted-foreground">
          Chaves de API, modelos, envio de documento e skills (prompts dos comandos).
        </p>
      </div>

      <div className="bg-red-950/30 border border-red-900/50 rounded-lg p-4 flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
        <div className="text-sm text-gray-300">
          <p className="font-semibold mb-1 text-red-400">Chaves sensíveis</p>
          <p>
            As chaves ficam apenas no servidor. Você pode inserir ou substituir uma chave, mas nunca
            visualizar a chave já configurada.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Chaves de API</CardTitle>
          <CardDescription>
            Cole uma nova chave para configurar ou substituir. Chaves existentes não são exibidas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {KEY_PROVIDERS.map(({ id, field, hasField, label, placeholder }) => {
            const configured = Boolean(settings?.[hasField]);
            const pending = pendingKeys[field as keyof PendingKeyUpdates] || '';
            const canTest = configured || pending.trim().length > 0;

            return (
              <div key={id} className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor={`${id}-key`}>{label}</Label>
                  <div className="flex items-center gap-2">
                    {configured && (
                      <Badge variant="secondary" className="bg-blue-950/50 text-blue-400 border-blue-900">
                        Configurada
                      </Badge>
                    )}
                    {testResults[id] === 'success' && (
                      <Badge variant="secondary" className="bg-green-950/50 text-green-400 border-green-900">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Conectado
                      </Badge>
                    )}
                    {testResults[id] === 'error' && (
                      <Badge variant="secondary" className="bg-red-950/50 text-red-400 border-red-900">
                        <XCircle className="h-3 w-3 mr-1" />
                        Erro
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Input
                    id={`${id}-key`}
                    type="password"
                    placeholder={configured ? 'Cole uma nova chave para substituir' : placeholder}
                    value={pending}
                    onChange={(e) => setPendingKey(field, e.target.value)}
                    autoComplete="off"
                  />
                  <Button
                    variant="outline"
                    onClick={() => handleTest(id)}
                    disabled={testing[id] || !canTest}
                  >
                    {testing[id] ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Testar'}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Modelos: {settings?.models?.[id]?.join(', ') || '—'}
                </p>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Skills / Comandos</CardTitle>
          <CardDescription>
            Cada skill é um prompt enviado ao LLM. Edite os padrões ou crie novas skills.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SkillsSection
            settings={settings}
            setSkillOverride={setSkillOverride}
            clearSkillOverride={clearSkillOverride}
            updateSkills={updateSkills}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Modelos Disponíveis</CardTitle>
          <CardDescription>Marque os modelos habilitados por provedor</CardDescription>
        </CardHeader>
        <CardContent>
          <ModelsSection
            settings={settings}
            availableModels={availableModels}
            loadingModels={loadingModels}
            toggleModel={toggleModel}
            loadAllModels={loadAllModels}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Envio de documento à IA</CardTitle>
          <CardDescription>
            Define como o conteúdo do documento é enviado em chat, /perguntar e operações
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DocumentProcessingSection
            settings={settings}
            updateDocumentProcessing={updateDocumentProcessing}
            onResetDefaults={resetDocumentProcessingDefaults}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Estimativas de Custo</CardTitle>
          <CardDescription>Preços aproximados por 1K tokens (USD)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            {settings?.pricesUSD &&
              Object.entries(settings.pricesUSD).map(([model, price]) => (
                <div key={model} className="flex justify-between items-center py-2 border-b">
                  <span className="font-medium">{model}</span>
                  <span className="text-muted-foreground">
                    ${price.in.toFixed(5)} in / ${price.out.toFixed(5)} out
                  </span>
                </div>
              ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Salvando...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Salvar Configurações
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
