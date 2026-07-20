'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Save, CheckCircle, XCircle, Loader2, AlertCircle } from 'lucide-react';
import { getAIErrorMessage } from '@/lib/ai-error-message';

export default function SettingsPage() {
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [testResults, setTestResults] = useState<Record<string, 'success' | 'error' | null>>({});
  const [loadingModels, setLoadingModels] = useState<Record<string, boolean>>({});
  const [availableModels, setAvailableModels] = useState<{
    openai: string[];
    gemini: string[];
    grok: string[];
    anthropic: string[];
  }>({ openai: [], gemini: [], grok: [], anthropic: [] });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    loadSettings();
  }, []);

  useEffect(() => {
    if (mounted && settings) {
      if (settings?.openaiKey) loadAllModels('openai');
      if (settings?.googleKey) loadAllModels('gemini');
      if (settings?.xaiKey) loadAllModels('grok');
      if (settings?.anthropicKey) loadAllModels('anthropic');
    }
  }, [mounted, settings?.openaiKey, settings?.googleKey, settings?.xaiKey, settings?.anthropicKey]);

  const loadSettings = async () => {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      setSettings(data.settings);
    } catch (error: any) {
      toast.error('Erro ao carregar configurações');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });

      if (!res.ok) throw new Error('Falha ao salvar');

      toast.success('Configurações salvas com sucesso!');
    } catch (error: any) {
      toast.error(error.message || 'Erro ao salvar configurações');
    } finally {
      setSaving(false);
    }
  };

  const loadAllModels = async (provider: 'openai' | 'gemini' | 'grok' | 'anthropic') => {
    setLoadingModels((prev) => ({ ...prev, [provider]: true }));

    try {
      const res = await fetch('/api/models/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider })
      });

      if (!res.ok) throw new Error('Falha ao buscar modelos');

      const data = await res.json();
      setAvailableModels((prev) => ({
        ...prev,
        [provider]: data.models
      }));
    } catch (error: any) {
      console.error(`${provider} models error:`, error);
    } finally {
      setLoadingModels((prev) => ({ ...prev, [provider]: false }));
    }
  };

  const toggleModel = (provider: 'openai' | 'gemini' | 'grok' | 'anthropic', model: string) => {
    const currentModels = settings?.models[provider] || [];
    const isSelected = currentModels.includes(model);

    const newModels = isSelected
      ? currentModels.filter((m: string) => m !== model)
      : [...currentModels, model];

    setSettings((prev: any) => ({
      ...prev,
      models: { ...prev.models, [provider]: newModels }
    }));
  };

  const handleTest = async (provider: 'openai' | 'gemini' | 'grok' | 'anthropic') => {
    setTesting((prev) => ({ ...prev, [provider]: true }));
    setTestResults((prev) => ({ ...prev, [provider]: null }));

    try {
      const res = await fetch('/api/settings/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider })
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
          Configure as chaves de API e modelos disponíveis
        </p>
      </div>

      <div className="bg-red-950/30 border border-red-900/50 rounded-lg p-4 flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
        <div className="text-sm text-gray-300">
          <p className="font-semibold mb-1 text-red-400">⚠️ Ambiente Local - Não Seguro</p>
          <p>
            As chaves são armazenadas apenas na memória do servidor e não são criptografadas.
            Use apenas para testes locais. Não compartilhe este ambiente ou exponha na internet.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Chaves de API</CardTitle>
          <CardDescription>
            Configure suas chaves para acessar os provedores de IA
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* OpenAI */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="openai-key">OpenAI API Key</Label>
              {testResults.openai === 'success' && (
                <Badge variant="secondary" className="bg-green-950/50 text-green-400 border-green-900">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Conectado
                </Badge>
              )}
              {testResults.openai === 'error' && (
                <Badge variant="secondary" className="bg-red-950/50 text-red-400 border-red-900">
                  <XCircle className="h-3 w-3 mr-1" />
                  Erro
                </Badge>
              )}
            </div>
            <div className="flex gap-2">
              <Input
                id="openai-key"
                type="password"
                placeholder="sk-..."
                value={settings?.openaiKey || ''}
                onChange={(e) =>
                  setSettings((prev: any) => ({ ...prev, openaiKey: e.target.value }))
                }
              />
              <Button
                variant="outline"
                onClick={() => handleTest('openai')}
                disabled={testing.openai || !settings?.openaiKey}
              >
                {testing.openai ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Testar'
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Modelos: {settings?.models.openai?.join(', ')}
            </p>
          </div>

          {/* Gemini */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="google-key">Google API Key (Gemini)</Label>
              {testResults.gemini === 'success' && (
                <Badge variant="secondary" className="bg-green-950/50 text-green-400 border-green-900">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Conectado
                </Badge>
              )}
              {testResults.gemini === 'error' && (
                <Badge variant="secondary" className="bg-red-950/50 text-red-400 border-red-900">
                  <XCircle className="h-3 w-3 mr-1" />
                  Erro
                </Badge>
              )}
            </div>
            <div className="flex gap-2">
              <Input
                id="google-key"
                type="password"
                placeholder="AIza..."
                value={settings?.googleKey || ''}
                onChange={(e) =>
                  setSettings((prev: any) => ({ ...prev, googleKey: e.target.value }))
                }
              />
              <Button
                variant="outline"
                onClick={() => handleTest('gemini')}
                disabled={testing.gemini || !settings?.googleKey}
              >
                {testing.gemini ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Testar'
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Modelos: {settings?.models.gemini?.join(', ')}
            </p>
          </div>

          {/* Grok */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="xai-key">xAI API Key (Grok)</Label>
              {testResults.grok === 'success' && (
                <Badge variant="secondary" className="bg-green-950/50 text-green-400 border-green-900">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Conectado
                </Badge>
              )}
              {testResults.grok === 'error' && (
                <Badge variant="secondary" className="bg-red-950/50 text-red-400 border-red-900">
                  <XCircle className="h-3 w-3 mr-1" />
                  Erro
                </Badge>
              )}
            </div>
            <div className="flex gap-2">
              <Input
                id="xai-key"
                type="password"
                placeholder="xai-..."
                value={settings?.xaiKey || ''}
                onChange={(e) =>
                  setSettings((prev: any) => ({ ...prev, xaiKey: e.target.value }))
                }
              />
              <Button
                variant="outline"
                onClick={() => handleTest('grok')}
                disabled={testing.grok || !settings?.xaiKey}
              >
                {testing.grok ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Testar'
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Modelos: {settings?.models.grok?.join(', ')}
            </p>
          </div>

          {/* Anthropic (Claude) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="anthropic-key">Anthropic API Key (Claude)</Label>
              {testResults.anthropic === 'success' && (
                <Badge variant="secondary" className="bg-green-950/50 text-green-400 border-green-900">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Conectado
                </Badge>
              )}
              {testResults.anthropic === 'error' && (
                <Badge variant="secondary" className="bg-red-950/50 text-red-400 border-red-900">
                  <XCircle className="h-3 w-3 mr-1" />
                  Erro
                </Badge>
              )}
            </div>
            <div className="flex gap-2">
              <Input
                id="anthropic-key"
                type="password"
                placeholder="sk-ant-..."
                value={settings?.anthropicKey || ''}
                onChange={(e) =>
                  setSettings((prev: any) => ({ ...prev, anthropicKey: e.target.value }))
                }
              />
              <Button
                variant="outline"
                onClick={() => handleTest('anthropic')}
                disabled={testing.anthropic || !settings?.anthropicKey}
              >
                {testing.anthropic ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Testar'
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Modelos: {settings?.models?.anthropic?.join(', ')}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Modelos Disponíveis</CardTitle>
          <CardDescription>
            Configure os modelos de cada provedor (separe por vírgula)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* OpenAI */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Modelos OpenAI</Label>
            {loadingModels.openai ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando modelos...
              </div>
            ) : availableModels.openai.length > 0 ? (
              <div className="grid grid-cols-2 gap-3">
                {availableModels.openai.map((model) => (
                  <div key={model} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id={`openai-${model}`}
                      checked={settings?.models?.openai?.includes(model) || false}
                      onChange={() => toggleModel('openai', model)}
                      className="rounded"
                    />
                    <label
                      htmlFor={`openai-${model}`}
                      className="text-sm cursor-pointer hover:text-primary"
                    >
                      {model}
                    </label>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Configure a chave OpenAI para carregar modelos
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Selecionados: {settings?.models?.openai?.length || 0}
            </p>
          </div>

          {/* Gemini */}
          <div className="space-y-3 border-t pt-6">
            <Label className="text-base font-semibold">Modelos Gemini</Label>
            {loadingModels.gemini ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando modelos...
              </div>
            ) : availableModels.gemini.length > 0 ? (
              <div className="grid grid-cols-2 gap-3">
                {availableModels.gemini.map((model) => (
                  <div key={model} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id={`gemini-${model}`}
                      checked={settings?.models?.gemini?.includes(model) || false}
                      onChange={() => toggleModel('gemini', model)}
                      className="rounded"
                    />
                    <label
                      htmlFor={`gemini-${model}`}
                      className="text-sm cursor-pointer hover:text-primary"
                    >
                      {model}
                    </label>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Configure a chave Gemini para carregar modelos
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Selecionados: {settings?.models?.gemini?.length || 0}
            </p>
          </div>

          {/* Grok */}
          <div className="space-y-3 border-t pt-6">
            <Label className="text-base font-semibold">Modelos Grok</Label>
            {loadingModels.grok ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando modelos...
              </div>
            ) : availableModels.grok.length > 0 ? (
              <div className="grid grid-cols-2 gap-3">
                {availableModels.grok.map((model) => (
                  <div key={model} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id={`grok-${model}`}
                      checked={settings?.models?.grok?.includes(model) || false}
                      onChange={() => toggleModel('grok', model)}
                      className="rounded"
                    />
                    <label
                      htmlFor={`grok-${model}`}
                      className="text-sm cursor-pointer hover:text-primary"
                    >
                      {model}
                    </label>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Configure a chave Grok para carregar modelos
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Selecionados: {settings?.models?.grok?.length || 0}
            </p>
          </div>

          {/* Claude */}
          <div className="space-y-3 border-t pt-6">
            <Label className="text-base font-semibold">Modelos Claude (Anthropic)</Label>
            {loadingModels.anthropic ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando modelos...
              </div>
            ) : availableModels.anthropic.length > 0 ? (
              <div className="grid grid-cols-2 gap-3">
                {availableModels.anthropic.map((model) => (
                  <div key={model} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id={`anthropic-${model}`}
                      checked={settings?.models?.anthropic?.includes(model) || false}
                      onChange={() => toggleModel('anthropic', model)}
                      className="rounded"
                    />
                    <label
                      htmlFor={`anthropic-${model}`}
                      className="text-sm cursor-pointer hover:text-primary"
                    >
                      {model}
                    </label>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Configure a chave Anthropic para carregar modelos
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Selecionados: {settings?.models?.anthropic?.length || 0}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Estimativas de Custo</CardTitle>
          <CardDescription>
            Preços aproximados por 1K tokens (USD)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            {settings?.pricesUSD &&
              Object.entries(settings.pricesUSD).map(([model, price]: [string, any]) => (
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
