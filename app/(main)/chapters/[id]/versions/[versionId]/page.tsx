'use client';

import { forwardRef, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft, FileText, Layers, Download, Languages, Sliders, Wand2,
  SearchCheck, Loader2, Info, Clock, Eye, Bot, Sparkles
} from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ReferenceManager, type ReferenceItem } from '@/components/thesis/reference-manager';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ExpandableTextarea } from '@/components/expandable-textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  ChapterOperationAiFields,
  type ChapterOpAIProvider,
  modelsForProvider
} from '@/components/thesis/chapter-operation-ai-fields';
import { VersionDiff } from '@/components/thesis/version-diff';
import { cn } from '@/lib/utils';

type ChapterVersion = {
  id: string;
  chapterId: string;
  versionNumber: number;
  filePath: string;
  pages: number | null;
  chunksCount: number | null;
  createdByOperation: string;
  metadata: any;
  createdAt: string;
  parentVersionId: string | null;
  isCurrent: boolean;
  chapterTitle?: string;
  chapterOrder?: number;
  thesisTitle?: string;
  thesisId?: string;
};

const OPERATION_CONFIG: Record<string, { label: string; color: string }> = {
  upload:   { label: 'Upload Original', color: 'bg-blue-500' },
  improve:  { label: 'Melhorado',       color: 'bg-green-500' },
  translate:{ label: 'Traduzido',       color: 'bg-purple-500' },
  adjust:   { label: 'Ajustado',        color: 'bg-orange-500' },
  adapt:    { label: 'Adaptado',        color: 'bg-pink-500' },
  update:   { label: 'Atualizado',      color: 'bg-yellow-500' },
};

function getOp(op: string) {
  return OPERATION_CONFIG[op] ?? { label: op, color: 'bg-gray-500' };
}

export default function ChapterVersionPage() {
  const params = useParams();
  const router = useRouter();
  const chapterId = params.id as string;
  const versionId = params.versionId as string;

  useEffect(() => {
    router.replace(`/chapters/${chapterId}/agent`);
  }, [chapterId, router]);

  const [version, setVersion] = useState<ChapterVersion | null>(null);
  const [allVersions, setAllVersions] = useState<ChapterVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [settingsModels, setSettingsModels] = useState<Partial<Record<ChapterOpAIProvider, string[]>> | null>(null);

  // Provider/model states
  const [translateProvider, setTranslateProvider] = useState<ChapterOpAIProvider>('openai');
  const [translateModel, setTranslateModel] = useState('');
  const [adjustProvider, setAdjustProvider] = useState<ChapterOpAIProvider>('gemini');
  const [adjustModel, setAdjustModel] = useState('');
  const [adaptProvider, setAdaptProvider] = useState<ChapterOpAIProvider>('openai');
  const [adaptModel, setAdaptModel] = useState('');
  const [revisarNormsProvider, setRevisarNormsProvider] = useState<ChapterOpAIProvider>('gemini');
  const [revisarNormsModel, setRevisarNormsModel] = useState('');

  // Dialog states
  const [translateDialogOpen, setTranslateDialogOpen] = useState(false);
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false);
  const [adaptDialogOpen, setAdaptDialogOpen] = useState(false);
  const [revisarDialogOpen, setRevisarDialogOpen] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);

  // Operation fields
  const [targetLanguage, setTargetLanguage] = useState('');
  const [adjustPrompt, setAdjustPrompt] = useState('');
  const [adjustCreativity, setAdjustCreativity] = useState(5);
  const [adjustUseGrounding, setAdjustUseGrounding] = useState(false);
  const [adaptStyle, setAdaptStyle] = useState<'academic' | 'professional' | 'simplified' | 'custom'>('simplified');
  const [adaptTargetAudience, setAdaptTargetAudience] = useState('');
  const [revisarAtualizarNormas, setRevisarAtualizarNormas] = useState(false);

  // References
  const [translateReferences, setTranslateReferences] = useState<ReferenceItem[]>([]);
  const [adjustReferences, setAdjustReferences] = useState<ReferenceItem[]>([]);
  const [adaptReferences, setAdaptReferences] = useState<ReferenceItem[]>([]);

  // Loading states
  const [processing, setProcessing] = useState(false);
  const [revisarLoading, setRevisarLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const versionsRes = await fetch(`/api/chapters/${chapterId}/versions`);
        if (!versionsRes.ok) throw new Error('Falha ao carregar versões');
        const versionsData = await versionsRes.json();
        if (cancelled) return;
        setAllVersions(versionsData.versions || []);

        const foundVersion = versionsData.versions?.find((v: any) => v.id === versionId);
        if (!foundVersion) {
          toast.error('Versão não encontrada');
          router.push(`/chapters/${chapterId}`);
          return;
        }

        const chapterRes = await fetch(`/api/chapters/${chapterId}`);
        if (chapterRes.ok) {
          const chapterData = await chapterRes.json();
          foundVersion.chapterTitle = chapterData.chapter.title;
          foundVersion.chapterOrder = chapterData.chapter.chapterOrder;
          foundVersion.thesisTitle = chapterData.chapter.thesisTitle;
          foundVersion.thesisId = chapterData.chapter.thesisId;
        }

        if (!cancelled) setVersion(foundVersion);
      } catch (error: any) {
        toast.error(error.message || 'Erro ao carregar versão');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [chapterId, versionId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/settings');
        const data = await res.json();
        if (cancelled) return;
        const m = data.settings?.models || {};
        setSettingsModels(m);
        const first = (p: ChapterOpAIProvider) => modelsForProvider(m, p)[0] || '';
        setTranslateModel((prev) => prev || first('openai'));
        setAdjustModel((prev) => prev || first('gemini'));
        setAdaptModel((prev) => prev || first('openai'));
        setRevisarNormsModel((prev) => prev || first('gemini'));
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  const handleDownload = async () => {
    try {
      toast.info('Iniciando download...');
      const response = await fetch(`/api/chapters/${chapterId}/versions/${versionId}/download`);
      if (!response.ok) throw new Error('Falha ao fazer download');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `capitulo_v${version?.versionNumber}.docx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('Download concluído!');
    } catch (error: any) {
      toast.error(error.message || 'Erro ao fazer download');
    }
  };

  const handleTranslate = async () => {
    if (!targetLanguage) return toast.error('Selecione o idioma de destino');
    if (!translateModel) return toast.error('Selecione o modelo de IA');
    try {
      setProcessing(true);
      const response = await fetch(`/api/chapters/${chapterId}/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          versionId, targetLanguage, provider: translateProvider, model: translateModel,
          references: translateReferences.map(r => ({ type: r.type, title: r.title, description: r.description, url: r.url, filePath: r.filePath, fileName: r.fileName, fileSize: r.fileSize, mimeType: r.mimeType }))
        })
      });
      if (!response.ok) throw new Error('Falha ao iniciar tradução');
      const data = await response.json();
      setTranslateDialogOpen(false);
      router.push(`/chapters/${chapterId}/translate/${data.jobId}`);
    } catch (error: any) {
      toast.error(error.message || 'Erro ao iniciar tradução');
      setProcessing(false);
    }
  };

  const handleAdjust = async () => {
    if (!adjustPrompt.trim()) return toast.error('Descreva o ajuste desejado');
    if (!adjustModel) return toast.error('Selecione o modelo de IA');
    try {
      setProcessing(true);
      const response = await fetch(`/api/chapters/${chapterId}/adjust`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          versionId, instructions: adjustPrompt.trim(), creativity: adjustCreativity,
          provider: adjustProvider, model: adjustModel, useGrounding: adjustUseGrounding,
          references: adjustReferences.map(r => ({ type: r.type, title: r.title, description: r.description, url: r.url, filePath: r.filePath, fileName: r.fileName, fileSize: r.fileSize, mimeType: r.mimeType })),
          contextVersionIds: []
        })
      });
      if (!response.ok) throw new Error('Falha ao iniciar ajuste');
      const data = await response.json();
      setAdjustDialogOpen(false);
      router.push(`/chapters/${chapterId}/adjust/${data.jobId}`);
    } catch (error: any) {
      toast.error(error.message || 'Erro ao iniciar ajuste');
      setProcessing(false);
    }
  };

  const handleAdapt = async () => {
    if (adaptStyle === 'custom' && !adaptTargetAudience.trim()) return toast.error('Especifique o público-alvo');
    if (!adaptModel) return toast.error('Selecione o modelo de IA');
    try {
      setProcessing(true);
      const response = await fetch(`/api/chapters/${chapterId}/adapt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          versionId, style: adaptStyle, targetAudience: adaptStyle === 'custom' ? adaptTargetAudience.trim() : undefined,
          provider: adaptProvider, model: adaptModel,
          references: adaptReferences.map(r => ({ type: r.type, title: r.title, description: r.description, url: r.url, filePath: r.filePath, fileName: r.fileName, fileSize: r.fileSize, mimeType: r.mimeType })),
          contextVersionIds: []
        })
      });
      if (!response.ok) throw new Error('Falha ao iniciar adaptação');
      const data = await response.json();
      setAdaptDialogOpen(false);
      router.push(`/chapters/${chapterId}/adapt/${data.jobId}`);
    } catch (error: any) {
      toast.error(error.message || 'Erro ao iniciar adaptação');
      setProcessing(false);
    }
  };

  const handleRevisar = async () => {
    if (!revisarAtualizarNormas) return toast.info('Marque pelo menos uma opção de revisão');
    if (!revisarNormsModel) return toast.error('Selecione o modelo de IA');
    try {
      setRevisarLoading(true);
      const res = await fetch(`/api/chapters/${chapterId}/versions/${versionId}/norms-update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: revisarNormsProvider, model: revisarNormsModel })
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Falha'); }
      const data = await res.json();
      setRevisarDialogOpen(false);
      router.push(`/norms-update/${data.jobId}`);
    } catch (error: any) {
      toast.error(error.message || 'Erro ao iniciar revisão');
    } finally {
      setRevisarLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-14 h-14 border-4 border-red-500/20 border-t-red-500 rounded-full animate-spin" />
        <p className="text-gray-400 mt-5 text-sm">Carregando versão...</p>
      </div>
    );
  }

  if (!version) return null;

  const { label: opLabel, color: opColor } = getOp(version.createdByOperation);
  const originalVersion = allVersions.find(v => !v.parentVersionId) ?? allVersions[0];
  const isOriginal = version.id === originalVersion?.id;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Back + Agent CTA */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => router.push(`/chapters/${chapterId}`)}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar para Capítulo
        </Button>

        <Link href={`/chapters/${chapterId}/agent`}>
          <Button
            size="sm"
            className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white shadow-lg shadow-red-500/20 gap-2"
          >
            <Bot className="h-4 w-4" />
            Modo Agente
            <Sparkles className="h-3 w-3" />
          </Button>
        </Link>
      </div>

      {/* Title row */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Layers className="h-7 w-7 text-red-400" />
            <h1 className="text-2xl font-bold text-white">Versão {version.versionNumber}</h1>
            {version.isCurrent && (
              <Badge className="bg-red-600 text-white">Atual</Badge>
            )}
            <Badge className={cn('text-white border-0', opColor)}>{opLabel}</Badge>
          </div>
          {version.chapterTitle && (
            <p className="text-sm text-gray-400 flex items-center gap-1.5 ml-10">
              <FileText className="h-3 w-3" />
              Capítulo {version.chapterOrder}: {version.chapterTitle}
              {version.thesisTitle && (
                <span className="text-gray-600">· {version.thesisTitle}</span>
              )}
            </p>
          )}
        </div>

        {/* Quick actions */}
        <div className="flex gap-2 flex-shrink-0">
          {!isOriginal && originalVersion && (
            <Button
              size="sm"
              variant="outline"
              className="border-white/15 text-gray-300 hover:bg-white/10 gap-1.5"
              onClick={() => setDiffOpen(true)}
            >
              <Eye className="h-3.5 w-3.5" />
              Ver vs Original
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="border-white/15 text-gray-300 hover:bg-white/10 gap-1.5"
            onClick={handleDownload}
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </Button>
        </div>
      </div>

      {/* Meta info */}
      <div className="flex flex-wrap gap-4 text-sm text-gray-400 bg-white/[0.03] border border-white/8 rounded-xl px-5 py-3">
        <div className="flex items-center gap-1.5">
          <Clock className="h-4 w-4" />
          {new Date(version.createdAt).toLocaleDateString('pt-BR', {
            day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
          })}
        </div>
        {version.pages && (
          <div className="flex items-center gap-1.5">
            <FileText className="h-4 w-4" />
            {version.pages} {version.pages === 1 ? 'página' : 'páginas'}
          </div>
        )}
      </div>

      {/* Operations panel */}
      <div>
        <h2 className="text-base font-semibold text-white mb-3">Transformar esta versão</h2>
        <p className="text-sm text-gray-400 mb-4">
          Cada operação cria uma nova versão derivada desta, preservando o histórico completo.
        </p>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-2">
          {/* Ajuste livre — highlighted as main */}
          <Dialog open={adjustDialogOpen} onOpenChange={setAdjustDialogOpen}>
            <DialogTrigger asChild>
              <button className="col-span-2 group flex items-start gap-4 p-4 rounded-xl border-2 border-red-500/25 bg-red-500/[0.05] hover:bg-red-500/[0.09] hover:border-red-500/40 transition-all text-left">
                <div className="p-2.5 bg-red-500/20 rounded-lg group-hover:bg-red-500/30 transition-colors flex-shrink-0">
                  <Sliders className="h-5 w-5 text-red-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white mb-0.5">Ajuste livre</p>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    Escreva um prompt e a IA executa exatamente o que você pedir — sem melhorias automáticas
                  </p>
                </div>
              </button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh]">
              <DialogHeader>
                <DialogTitle>Ajuste livre no capítulo</DialogTitle>
                <DialogDescription>
                  A IA segue apenas as instruções que você escrever. Uma nova versão será criada.
                </DialogDescription>
              </DialogHeader>
              <div className="px-6 pt-2">
                <ChapterOperationAiFields
                  provider={adjustProvider} model={adjustModel}
                  onProviderChange={(p) => {
                    if (adjustUseGrounding && p !== 'gemini') { setAdjustUseGrounding(false); toast.info('Pesquisa na web só disponível com Gemini.'); }
                    setAdjustProvider(p);
                    setAdjustModel(modelsForProvider(settingsModels, p)[0] || '');
                  }}
                  onModelChange={setAdjustModel} settingsModels={settingsModels} disabled={processing}
                />
              </div>
              <ScrollArea className="max-h-[60vh] pr-4">
                <div className="space-y-4 py-4">
                  <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                    <div className="flex items-start gap-2">
                      <Info className="h-4 w-4 text-amber-400 mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-amber-300 leading-relaxed">
                        A IA irá fazer <strong>APENAS</strong> o que você pedir. Sem melhorias automáticas de gramática, clareza ou estilo — a não ser que você peça.
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="adjust-prompt">Instruções *</Label>
                    <ExpandableTextarea
                      id="adjust-prompt"
                      placeholder='Ex: "Expandir a conclusão com mais exemplos práticos" ou "Remover jargão técnico da introdução"'
                      value={adjustPrompt} onChange={setAdjustPrompt} disabled={processing} minRows={4} maxRows={20}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Criatividade: {adjustCreativity}/10</Label>
                    <p className="text-xs text-gray-500">
                      {adjustCreativity < 3 ? 'Conservador — próximo do original'
                        : adjustCreativity < 7 ? 'Moderado — flexível na reformulação'
                        : 'Criativo — reformula livremente, mas só o que você pediu'}
                    </p>
                    <input type="range" min="0" max="10" value={adjustCreativity}
                      onChange={(e) => setAdjustCreativity(parseInt(e.target.value))} disabled={processing}
                      className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-red-500" />
                    <div className="flex justify-between text-xs text-gray-600">
                      <span>Conservador</span><span>Moderado</span><span>Criativo</span>
                    </div>
                  </div>
                  <div className="border-t border-white/10 pt-4">
                    <div className="flex items-start gap-3 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                      <Checkbox id="adjust-grounding" checked={adjustUseGrounding}
                        onCheckedChange={(c) => {
                          const on = !!c;
                          if (on && adjustProvider !== 'gemini') {
                            setAdjustProvider('gemini');
                            setAdjustModel(modelsForProvider(settingsModels, 'gemini')[0] || '');
                            toast.info('Provedor alterado para Gemini — necessário para pesquisa na web.');
                          }
                          setAdjustUseGrounding(on);
                        }} />
                      <div>
                        <Label htmlFor="adjust-grounding" className="text-sm font-medium text-blue-300 cursor-pointer">
                          Usar pesquisa na internet (Google Search Grounding)
                        </Label>
                        <p className="text-xs text-blue-400/70 mt-0.5">Requer Google Gemini selecionado acima</p>
                      </div>
                    </div>
                  </div>
                  <div className="border-t border-white/10 pt-4 space-y-2">
                    <Label>Materiais de Referência (opcional)</Label>
                    <ReferenceManager references={adjustReferences} onChange={setAdjustReferences} />
                  </div>
                </div>
              </ScrollArea>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setAdjustDialogOpen(false)} disabled={processing}>Cancelar</Button>
                <Button onClick={handleAdjust} disabled={processing || !adjustPrompt.trim() || !adjustModel}>
                  {processing ? 'Processando...' : 'Iniciar ajuste'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Traduzir */}
          <Dialog open={translateDialogOpen} onOpenChange={setTranslateDialogOpen}>
            <DialogTrigger asChild>
              <OperationCard icon={<Languages className="h-5 w-5 text-purple-400" />} iconBg="bg-purple-500/15"
                title="Traduzir" description="Converte o capítulo para outro idioma" />
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh]">
              <DialogHeader>
                <DialogTitle>Traduzir Capítulo</DialogTitle>
                <DialogDescription>Traduzir para outro idioma. Uma nova versão será criada.</DialogDescription>
              </DialogHeader>
              <div className="px-6 pt-2">
                <ChapterOperationAiFields
                  provider={translateProvider} model={translateModel}
                  onProviderChange={(p) => { setTranslateProvider(p); setTranslateModel(modelsForProvider(settingsModels, p)[0] || ''); }}
                  onModelChange={setTranslateModel} settingsModels={settingsModels} disabled={processing}
                />
              </div>
              <ScrollArea className="max-h-[60vh] pr-4">
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="target-language">Idioma de Destino *</Label>
                    <Select value={targetLanguage} onValueChange={setTargetLanguage}>
                      <SelectTrigger id="target-language"><SelectValue placeholder="Selecione o idioma" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pt">Português</SelectItem>
                        <SelectItem value="en">Inglês</SelectItem>
                        <SelectItem value="es">Espanhol</SelectItem>
                        <SelectItem value="fr">Francês</SelectItem>
                        <SelectItem value="de">Alemão</SelectItem>
                        <SelectItem value="it">Italiano</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="border-t border-white/10 pt-4 space-y-2">
                    <Label>Materiais de Referência (opcional)</Label>
                    <ReferenceManager references={translateReferences} onChange={setTranslateReferences} />
                  </div>
                </div>
              </ScrollArea>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setTranslateDialogOpen(false)} disabled={processing}>Cancelar</Button>
                <Button onClick={handleTranslate} disabled={processing || !targetLanguage || !translateModel}>
                  {processing ? 'Processando...' : 'Iniciar Tradução'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Adaptar */}
          <Dialog open={adaptDialogOpen} onOpenChange={setAdaptDialogOpen}>
            <DialogTrigger asChild>
              <OperationCard icon={<Wand2 className="h-5 w-5 text-pink-400" />} iconBg="bg-pink-500/15"
                title="Adaptar texto" description="Muda tom e estilo para outro público-alvo" />
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh]">
              <DialogHeader>
                <DialogTitle>Adaptar texto</DialogTitle>
                <DialogDescription>Adaptar para um estilo ou público-alvo diferente. Nova versão será criada.</DialogDescription>
              </DialogHeader>
              <div className="px-6 pt-2">
                <ChapterOperationAiFields
                  provider={adaptProvider} model={adaptModel}
                  onProviderChange={(p) => { setAdaptProvider(p); setAdaptModel(modelsForProvider(settingsModels, p)[0] || ''); }}
                  onModelChange={setAdaptModel} settingsModels={settingsModels} disabled={processing}
                />
              </div>
              <ScrollArea className="max-h-[60vh] pr-4">
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="adapt-style">Estilo *</Label>
                    <Select value={adaptStyle} onValueChange={(v: any) => setAdaptStyle(v)}>
                      <SelectTrigger id="adapt-style"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="academic">Acadêmico — formal e técnico</SelectItem>
                        <SelectItem value="professional">Profissional — direto e objetivo</SelectItem>
                        <SelectItem value="simplified">Simplificado — acessível e claro</SelectItem>
                        <SelectItem value="custom">Personalizado — especificar público</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {adaptStyle === 'custom' && (
                    <div className="space-y-2">
                      <Label htmlFor="target-audience">Público-Alvo *</Label>
                      <input id="target-audience" type="text"
                        placeholder="Ex: Estudantes de graduação, profissionais da área..."
                        value={adaptTargetAudience} onChange={(e) => setAdaptTargetAudience(e.target.value)} disabled={processing}
                        className="flex h-10 w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-gray-600 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-500/40" />
                    </div>
                  )}
                  <div className="border-t border-white/10 pt-4 space-y-2">
                    <Label>Materiais de Referência (opcional)</Label>
                    <ReferenceManager references={adaptReferences} onChange={setAdaptReferences} />
                  </div>
                </div>
              </ScrollArea>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setAdaptDialogOpen(false)} disabled={processing}>Cancelar</Button>
                <Button onClick={handleAdapt} disabled={processing || !adaptModel || (adaptStyle === 'custom' && !adaptTargetAudience.trim())}>
                  {processing ? 'Processando...' : 'Iniciar Adaptação'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Revisar leis */}
          <Dialog open={revisarDialogOpen} onOpenChange={setRevisarDialogOpen}>
            <DialogTrigger asChild>
              <OperationCard icon={<SearchCheck className="h-5 w-5 text-yellow-400" />} iconBg="bg-yellow-500/15"
                title="Revisar leis" description="Verifica se leis e normas citadas estão vigentes" />
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <SearchCheck className="h-5 w-5" />
                  Revisar leis no capítulo
                </DialogTitle>
                <DialogDescription>Verifica leis e normas citadas (LexML/Senado + IA).</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <ChapterOperationAiFields
                  provider={revisarNormsProvider} model={revisarNormsModel}
                  onProviderChange={(p) => { setRevisarNormsProvider(p); setRevisarNormsModel(modelsForProvider(settingsModels, p)[0] || ''); }}
                  onModelChange={setRevisarNormsModel} settingsModels={settingsModels} disabled={revisarLoading}
                />
                <div className="flex items-start gap-3 p-3 rounded-lg border border-white/10 bg-white/5">
                  <Checkbox id="revisar-normas" checked={revisarAtualizarNormas}
                    onCheckedChange={(c) => setRevisarAtualizarNormas(!!c)} />
                  <div>
                    <Label htmlFor="revisar-normas" className="text-sm font-medium cursor-pointer">Atualizar normas</Label>
                    <p className="text-xs text-gray-500 mt-0.5">Verifica vigência das leis e cria nova versão com alterações aprovadas</p>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setRevisarDialogOpen(false)} disabled={revisarLoading}>Cancelar</Button>
                <Button onClick={handleRevisar} disabled={revisarLoading || !revisarAtualizarNormas || !revisarNormsModel}>
                  {revisarLoading ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Iniciando...</>) : 'Iniciar revisão'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Version lineage */}
      {(() => {
        const parentVersion = version.parentVersionId ? allVersions.find((v) => v.id === version.parentVersionId) : null;
        const childVersions = allVersions.filter((v) => v.parentVersionId === version.id);
        if (!parentVersion && !childVersions.length) return null;
        return (
          <Card className="bg-gradient-to-br from-white/[0.07] to-white/[0.02] backdrop-blur-xl border-white/10">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Layers className="h-4 w-4 text-red-400" />
                Linhagem desta versão
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {parentVersion && (
                <div>
                  <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide">Derivada de</p>
                  <VersionPill version={parentVersion} chapterId={chapterId} />
                </div>
              )}
              {childVersions.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide">
                    Deu origem a ({childVersions.length})
                  </p>
                  <div className="space-y-2">
                    {childVersions.map((child) => (
                      <VersionPill key={child.id} version={child} chapterId={chapterId} />
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })()}

      {/* Diff dialog: original vs this version */}
      {!isOriginal && originalVersion && (
        <VersionDiff
          open={diffOpen}
          onOpenChange={setDiffOpen}
          chapterId={chapterId}
          leftVersionId={originalVersion.id}
          leftVersionNumber={originalVersion.versionNumber}
          leftLabel="Original"
          rightVersionId={version.id}
          rightVersionNumber={version.versionNumber}
          rightLabel={version.isCurrent ? 'Atual' : getOp(version.createdByOperation).label}
        />
      )}
    </div>
  );
}

type OperationCardProps = {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  description: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

const OperationCard = forwardRef<HTMLButtonElement, OperationCardProps>(function OperationCard(
  { icon, iconBg, title, description, ...buttonProps },
  ref
) {
  return (
    <button
      ref={ref}
      type="button"
      {...buttonProps}
      className="group flex items-start gap-3 p-4 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.07] hover:border-white/20 transition-all text-left w-full"
    >
      <div className={cn('p-2 rounded-lg flex-shrink-0 transition-opacity group-hover:opacity-100 opacity-80', iconBg)}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-white">{title}</p>
        <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{description}</p>
      </div>
    </button>
  );
});

function VersionPill({ version, chapterId }: { version: ChapterVersion; chapterId: string }) {
  const router = useRouter();
  const { label, color } = getOp(version.createdByOperation);
  return (
    <div className="flex items-center justify-between p-3 bg-white/5 border border-white/10 rounded-lg">
      <div className="flex items-center gap-3">
        <Layers className="h-4 w-4 text-gray-500" />
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-white">v{version.versionNumber}</span>
            {version.isCurrent && <Badge className="bg-red-600 text-white text-xs px-1.5 py-0">Atual</Badge>}
            <Badge className={cn('text-white border-0 text-xs', color)}>{label}</Badge>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            {new Date(version.createdAt).toLocaleDateString('pt-BR')}
          </p>
        </div>
      </div>
      <Button size="sm" variant="ghost" className="text-gray-400 hover:text-white h-7"
        onClick={() => router.push(`/chapters/${chapterId}/versions/${version.id}`)}>
        Ver
      </Button>
    </div>
  );
}
