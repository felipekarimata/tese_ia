'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { RefreshCw, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';

type NormsProvider = 'gemini' | 'anthropic' | 'openai';

const DEFAULT_MODELS: Record<NormsProvider, string> = {
  gemini: 'gemini-2.5-flash',
  anthropic: 'claude-sonnet-4-6',
  openai: 'gpt-5.4-mini'
};

interface UpdateNormsButtonProps {
  documentId: string;
  documentTitle: string;
}

export function UpdateNormsButton({ documentId, documentTitle }: UpdateNormsButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState<NormsProvider>('gemini');
  const [model, setModel] = useState(DEFAULT_MODELS.gemini);
  const [modelsByProvider, setModelsByProvider] = useState<Partial<Record<NormsProvider, string[]>>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/settings');
        const data = await res.json();
        const s = data.settings;
        if (cancelled || !s?.models) return;
        setModelsByProvider({
          gemini: s.models.gemini?.length
            ? s.models.gemini
            : ['gemini-3-flash-preview', 'gemini-2.5-flash'],
          anthropic: s.models.anthropic?.length
            ? s.models.anthropic
            : ['claude-sonnet-4-6', 'claude-opus-4-6', 'claude-haiku-4-5'],
          openai: s.models.openai?.length ? s.models.openai : ['gpt-5.4-mini', 'gpt-5.4']
        });
      } catch {
        /* keep defaults */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const providerModels =
    modelsByProvider[provider] ?? [DEFAULT_MODELS[provider]];

  const handleProviderChange = (p: NormsProvider) => {
    setProvider(p);
    const list = modelsByProvider[p] ?? [DEFAULT_MODELS[p]];
    setModel(list[0] || DEFAULT_MODELS[p]);
  };

  const handleUpdateNorms = async () => {
    setLoading(true);
    toast.loading('Iniciando análise de normas...');

    try {
      const res = await fetch('/api/norms-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId,
          provider,
          model
        })
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Falha ao iniciar análise');
      }

      const data = await res.json();
      toast.dismiss();
      toast.success('Análise iniciada!');

      router.push(`/norms-update/${data.jobId}`);
    } catch (error: any) {
      toast.dismiss();
      toast.error(error.message || 'Erro ao iniciar análise');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
      <div className="grid grid-cols-2 gap-2 flex-1 min-w-0">
        <div>
          <Label className="text-xs text-muted-foreground">Provedor</Label>
          <Select value={provider} onValueChange={(v) => handleProviderChange(v as NormsProvider)}>
            <SelectTrigger className="h-9 mt-0.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="gemini">Gemini (Google Search)</SelectItem>
              <SelectItem value="anthropic">Claude (web search)</SelectItem>
              <SelectItem value="openai">OpenAI</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Modelo</Label>
          <Select value={model} onValueChange={setModel}>
            <SelectTrigger className="h-9 mt-0.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {providerModels.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <Button
        onClick={handleUpdateNorms}
        disabled={loading}
        variant="outline"
        className="gap-2 shrink-0"
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Analisando...
          </>
        ) : (
          <>
            <RefreshCw className="h-4 w-4" />
            Atualizar Normas
          </>
        )}
      </Button>
    </div>
  );
}
