'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Languages, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { getAIErrorMessage } from '@/lib/ai-error-message';

type TranslationDialogProps = {
  documentId: string;
  documentTitle: string;
};

const LANGUAGES = {
  en: 'English',
  pt: 'Português',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  it: 'Italiano',
  zh: '中文',
  ja: '日本語',
  ko: '한국어',
  ru: 'Русский'
};

const PROVIDERS = {
  openai: 'OpenAI',
  gemini: 'Google Gemini',
  grok: 'xAI Grok',
  anthropic: 'Claude (Anthropic)'
};

const MODELS_BY_PROVIDER: Record<string, string[]> = {
  openai: ['gpt-5.4-mini', 'gpt-5.4'],
  gemini: [
    'gemini-3-flash-preview',
    'gemini-2.5-flash',
    'gemini-2.5-pro',
    'gemini-2.5-flash-lite'
  ],
  grok: ['grok-4-1-fast-non-reasoning', 'grok-4-1-fast-reasoning'],
  anthropic: ['claude-sonnet-4-6', 'claude-opus-4-6', 'claude-haiku-4-5']
};

export function TranslateDialog({ documentId, documentTitle }: TranslationDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sourceLanguage, setSourceLanguage] = useState<string>('auto'); // NEW: Source language (default auto-detect)
  const [targetLanguage, setTargetLanguage] = useState<string>('');
  const [provider, setProvider] = useState<string>('');
  const [model, setModel] = useState<string>('');
  const [maxPages, setMaxPages] = useState<string>(''); // NEW: Limit pages to translate
  const [isTranslating, setIsTranslating] = useState(false);

  const handleStartTranslation = async () => {
    if (!targetLanguage || !provider || !model) {
      toast.error('Por favor, preencha todos os campos');
      return;
    }

    try {
      setIsTranslating(true);

      const res = await fetch(`/api/translate/${documentId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceLanguage: sourceLanguage && sourceLanguage !== 'auto' ? sourceLanguage : undefined, // Auto-detect if empty or "auto"
          targetLanguage,
          provider,
          model,
          maxPages: maxPages ? parseInt(maxPages) : undefined // Limit pages if specified
        })
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Falha ao iniciar tradução');
      }

      const data = await res.json();
      toast.success('Tradução iniciada! Redirecionando...');

      // Redireciona para página de visualização
      setTimeout(() => {
        router.push(`/translations/${data.jobId}`);
      }, 1000);

    } catch (error: any) {
      console.error('Translation error:', error);
      toast.error(getAIErrorMessage(error, 'Falha ao iniciar tradução'));
      setIsTranslating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" suppressHydrationWarning>
          <Languages className="w-4 h-4 mr-2" />
          Traduzir Documento
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md" suppressHydrationWarning>
        <DialogHeader>
          <DialogTitle>Traduzir Documento</DialogTitle>
          <DialogDescription>
            Traduz o documento completo preservando toda a formatação original
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="source-language">Idioma de Origem</Label>
            <Select value={sourceLanguage} onValueChange={setSourceLanguage} disabled={isTranslating}>
              <SelectTrigger id="source-language">
                <SelectValue placeholder="Auto-detectar" />
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

          <div className="space-y-2">
            <Label htmlFor="target-language">Idioma de Destino</Label>
            <Select value={targetLanguage} onValueChange={setTargetLanguage} disabled={isTranslating}>
              <SelectTrigger id="target-language">
                <SelectValue placeholder="Selecione o idioma" />
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

          <div className="space-y-2">
            <Label htmlFor="max-pages">Páginas para Traduzir (opcional)</Label>
            <input
              id="max-pages"
              type="number"
              min="1"
              placeholder="Deixe vazio para traduzir tudo"
              value={maxPages}
              onChange={(e) => setMaxPages(e.target.value)}
              disabled={isTranslating}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
            <p className="text-xs text-muted-foreground">
              Limite a tradução às primeiras N páginas (útil para testes)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="provider">Provedor de IA</Label>
            <Select
              value={provider}
              onValueChange={(val) => {
                setProvider(val);
                setModel('');
              }}
              disabled={isTranslating}
            >
              <SelectTrigger id="provider">
                <SelectValue placeholder="Selecione o provedor" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PROVIDERS).map(([code, name]) => (
                  <SelectItem key={code} value={code}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {provider && (
            <div className="space-y-2">
              <Label htmlFor="model">Modelo</Label>
              <Select value={model} onValueChange={setModel} disabled={isTranslating}>
                <SelectTrigger id="model">
                  <SelectValue placeholder="Selecione o modelo" />
                </SelectTrigger>
                <SelectContent>
                  {MODELS_BY_PROVIDER[provider]?.map((modelName) => (
                    <SelectItem key={modelName} value={modelName}>
                      {modelName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="pt-2">
            <Button
              onClick={handleStartTranslation}
              className="w-full"
              disabled={!targetLanguage || !provider || !model || isTranslating}
            >
              {isTranslating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Iniciando...
                </>
              ) : (
                <>
                  <Languages className="w-4 h-4 mr-2" />
                  Iniciar Tradução
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
