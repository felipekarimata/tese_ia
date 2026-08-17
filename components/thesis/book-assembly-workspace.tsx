'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  CheckCircle2,
  Clock3,
  FileStack,
  GripVertical,
  Layers3,
  Loader2,
  Plus,
  Search,
  Settings,
  Sparkles,
  Trash2,
  WandSparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { BookAssemblyJobView } from './book-assembly-job-view';
import { chapterVersionLabel } from '@/lib/thesis/version-labels';
import type { AIProvider } from '@/lib/ai/types';
import type { BookAssemblyJob, BookAssemblyMode } from '@/lib/book-assembly/types';

type SourceVersion = {
  id: string;
  versionNumber: number;
  filePath: string;
  pages: number | null;
  createdByOperation: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  isCurrent: boolean;
};

type BookSource = {
  id: string;
  thesisId: string;
  thesisTitle: string;
  thesisDescription?: string;
  chapterTitle: string;
  chapterOrder: number;
  title: string;
  updatedAt: string;
  versions: SourceVersion[];
};

type PublicSettings = {
  models: Record<AIProvider, string[]>;
  hasOpenaiKey: boolean;
  hasGoogleKey: boolean;
  hasXaiKey: boolean;
  hasAnthropicKey: boolean;
};

const PROVIDERS: Array<{ value: AIProvider; label: string; keyField: keyof PublicSettings }> = [
  { value: 'openai', label: 'OpenAI', keyField: 'hasOpenaiKey' },
  { value: 'gemini', label: 'Google Gemini', keyField: 'hasGoogleKey' },
  { value: 'anthropic', label: 'Anthropic Claude', keyField: 'hasAnthropicKey' },
  { value: 'grok', label: 'xAI Grok', keyField: 'hasXaiKey' },
];

const ACTIVE_STATUSES = new Set<BookAssemblyJob['status']>([
  'queued', 'analyzing', 'harmonizing', 'finalizing',
]);

const MODE_OPTIONS: Array<{
  value: BookAssemblyMode;
  title: string;
  description: string;
  icon: typeof FileStack;
}> = [
  {
    value: 'compile',
    title: 'Somente compilar',
    description: 'Junta os DOCX na ordem escolhida, sem chamar IA nem alterar o texto.',
    icon: FileStack,
  },
  {
    value: 'harmonize',
    title: 'Harmonizar o livro',
    description: 'Corrige transições, continuidade, repetições e terminologia com intervenção conservadora.',
    icon: Sparkles,
  },
  {
    value: 'structural',
    title: 'Edição estrutural',
    description: 'Permite mudanças editoriais mais amplas e adições conectivas baseadas no texto existente.',
    icon: WandSparkles,
  },
];

function docxVersions(source: BookSource): SourceVersion[] {
  return source.versions.filter((version) => version.filePath.toLowerCase().endsWith('.docx'));
}

function historyStatus(job: BookAssemblyJob) {
  if (job.status === 'completed') return 'Concluído';
  if (job.status === 'failed') return 'Interrompido';
  if (job.status === 'awaiting_plan_approval') return 'Aprovar plano';
  if (job.status === 'awaiting_changes_approval') return 'Revisar alterações';
  return job.progressLabel || 'Em processamento';
}

export function BookAssemblyWorkspace() {
  const [sources, setSources] = useState<BookSource[]>([]);
  const [jobs, setJobs] = useState<BookAssemblyJob[]>([]);
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const [activeJob, setActiveJob] = useState<BookAssemblyJob | null>(null);

  const [search, setSearch] = useState('');
  const [bookTitle, setBookTitle] = useState('');
  const [mode, setMode] = useState<BookAssemblyMode>('harmonize');
  const [includeCoverPage, setIncludeCoverPage] = useState(true);
  const [customInstructions, setCustomInstructions] = useState('');
  const [versionIds, setVersionIds] = useState<Record<string, string>>({});
  const [selectedOrder, setSelectedOrder] = useState<string[]>([]);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [provider, setProvider] = useState<AIProvider>('openai');
  const [model, setModel] = useState('');

  const availableProviders = useMemo(() => {
    if (!settings) return [];
    return PROVIDERS.filter(
      (item) => Boolean(settings[item.keyField]) && (settings.models[item.value]?.length || 0) > 0
    );
  }, [settings]);

  const sourceMap = useMemo(
    () => new Map(sources.map((source) => [source.id, source])),
    [sources]
  );

  const selectedSources = useMemo(
    () => selectedOrder
      .map((id) => sourceMap.get(id))
      .filter((source): source is BookSource => Boolean(source)),
    [selectedOrder, sourceMap]
  );

  const filteredSources = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('pt-BR');
    if (!normalizedSearch) return sources;
    return sources.filter((source) => [
      source.title,
      source.thesisTitle,
      source.chapterTitle,
      source.thesisDescription || '',
    ].some((value) => value.toLocaleLowerCase('pt-BR').includes(normalizedSearch)));
  }, [search, sources]);

  const selectedCount = selectedSources.filter((source) => versionIds[source.id]).length;

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [sourcesResponse, settingsResponse, jobsResponse, healthResponse] = await Promise.all([
        fetch('/api/book-assembly/sources', { cache: 'no-store' }),
        fetch('/api/settings', { cache: 'no-store' }),
        fetch('/api/book-assembly', { cache: 'no-store' }),
        fetch('/api/book-assembly/health', { cache: 'no-store' }),
      ]);
      const [sourcesData, settingsData, jobsData, healthData] = await Promise.all([
        sourcesResponse.json(), settingsResponse.json(), jobsResponse.json(), healthResponse.json(),
      ]);
      if (!healthResponse.ok) throw new Error(healthData.error || 'A estrutura de Montar Livro ainda não foi preparada.');
      if (!sourcesResponse.ok) throw new Error(sourcesData.error || 'Falha ao carregar os uploads');
      if (!settingsResponse.ok) throw new Error(settingsData.error || 'Falha ao carregar configurações');
      if (!jobsResponse.ok) throw new Error(jobsData.error || 'Falha ao carregar montagens');

      const loadedSources: BookSource[] = sourcesData.sources || [];
      const initialVersions: Record<string, string> = {};
      for (const source of loadedSources) {
        const compatible = docxVersions(source);
        const preferred = compatible.find((version) => version.isCurrent) || compatible[0];
        if (preferred) initialVersions[source.id] = preferred.id;
      }

      setSources(loadedSources);
      setVersionIds(initialVersions);
      setSettings(settingsData.settings);
      setJobs(jobsData.jobs || []);

      const firstProvider = PROVIDERS.find(
        (item) => Boolean(settingsData.settings?.[item.keyField])
          && (settingsData.settings?.models?.[item.value]?.length || 0) > 0
      );
      if (firstProvider) {
        setProvider(firstProvider.value);
        setModel(settingsData.settings.models[firstProvider.value][0]);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  const refreshActiveJob = useCallback(async () => {
    if (!activeJob) return;
    const response = await fetch(
      `/api/theses/${activeJob.thesisId}/book-assembly/${activeJob.id}`,
      { cache: 'no-store' }
    );
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Falha ao atualizar a montagem');
    setActiveJob(data.job);
    setJobs((current) => [data.job, ...current.filter((job) => job.id !== data.job.id)]);
  }, [activeJob?.id, activeJob?.thesisId]);

  useEffect(() => {
    if (!activeJob || !ACTIVE_STATUSES.has(activeJob.status)) return;
    const timer = window.setInterval(() => {
      void refreshActiveJob().catch((pollError) => console.error('[BOOK-ASSEMBLY-UI] Poll failed:', pollError));
    }, 3000);
    return () => window.clearInterval(timer);
  }, [activeJob?.id, activeJob?.status, refreshActiveJob]);

  const handleProviderChange = (value: AIProvider) => {
    setProvider(value);
    setModel(settings?.models[value]?.[0] || '');
  };

  const addSource = (source: BookSource) => {
    if (docxVersions(source).length === 0) return;
    setSelectedOrder((current) => current.includes(source.id) ? current : [...current, source.id]);
  };

  const removeSource = (sourceId: string) => {
    setSelectedOrder((current) => current.filter((id) => id !== sourceId));
  };

  const moveSource = (sourceId: string, delta: number) => {
    setSelectedOrder((current) => {
      const index = current.indexOf(sourceId);
      const target = index + delta;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const dropSource = (targetId: string) => {
    if (!draggedId || draggedId === targetId) return;
    setSelectedOrder((current) => {
      const next = current.filter((id) => id !== draggedId);
      const targetIndex = next.indexOf(targetId);
      next.splice(targetIndex, 0, draggedId);
      return next;
    });
    setDraggedId(null);
  };

  const startAssembly = async () => {
    if (!bookTitle.trim()) {
      toast.error('Informe o título do novo livro');
      return;
    }
    if (selectedCount === 0) {
      toast.error('Adicione pelo menos um upload com versão DOCX');
      return;
    }
    if (mode !== 'compile' && (!provider || !model)) {
      toast.error('Selecione o provedor e o modelo de IA');
      return;
    }

    try {
      setStarting(true);
      const chapterSelections = selectedSources
        .filter((source) => versionIds[source.id])
        .map((source, index) => ({
          chapterId: source.id,
          versionId: versionIds[source.id],
          order: index + 1,
        }));
      const response = await fetch('/api/book-assembly', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: bookTitle.trim(),
          mode,
          provider: mode === 'compile' ? undefined : provider,
          model: mode === 'compile' ? undefined : model,
          customInstructions,
          includeCoverPage,
          chapterSelections,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Falha ao iniciar a montagem');
      setActiveJob(data.job);
      setJobs((current) => [data.job, ...current.filter((job) => job.id !== data.job.id)]);
      toast.success(
        mode === 'compile'
          ? 'Compilação iniciada em um novo livro.'
          : 'Novo livro criado. A análise editorial foi iniciada.'
      );
    } catch (startError) {
      toast.error(startError instanceof Error ? startError.message : String(startError));
    } finally {
      setStarting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" /> Carregando seus uploads...
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle>Não foi possível abrir o construtor</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => void loadWorkspace()}>Tentar novamente</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start gap-3">
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3">
          <FileStack className="h-6 w-6 text-red-400" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">Montar Livro</h1>
          <p className="mt-1 max-w-3xl text-muted-foreground">
            Cada upload pode ser um capítulo. Adicione os documentos desejados, organize a ordem e gere um novo livro sem alterar os originais.
          </p>
        </div>
      </div>

      {activeJob ? (
        <BookAssemblyJobView
          thesisId={activeJob.thesisId}
          job={activeJob}
          onRefresh={refreshActiveJob}
          onNew={() => setActiveJob(null)}
        />
      ) : (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <Layers3 className="h-5 w-5" /> 1. Escolha os uploads e defina a ordem
                  </CardTitle>
                  <CardDescription className="mt-2">
                    Adicione cada documento que deve entrar como capítulo. A lista da direita será a ordem final do livro.
                  </CardDescription>
                </div>
                <Badge variant="secondary" className="w-fit">
                  {selectedCount} selecionado{selectedCount === 1 ? '' : 's'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                <section className="min-w-0 rounded-xl border bg-muted/10">
                  <div className="border-b p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h2 className="font-semibold">Uploads disponíveis</h2>
                        <p className="text-xs text-muted-foreground">{sources.length} documento{sources.length === 1 ? '' : 's'}</p>
                      </div>
                    </div>
                    <div className="relative mt-3">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Buscar upload..."
                        className="pl-9"
                      />
                    </div>
                  </div>
                  <div className="max-h-[620px] space-y-3 overflow-y-auto p-3">
                    {filteredSources.length === 0 ? (
                      <div className="py-12 text-center text-sm text-muted-foreground">
                        {sources.length === 0 ? 'Nenhum upload disponível.' : 'Nenhum upload encontrado.'}
                      </div>
                    ) : filteredSources.map((source) => {
                      const compatibleVersions = docxVersions(source);
                      const selected = selectedOrder.includes(source.id);
                      const compatible = compatibleVersions.length > 0;
                      return (
                        <div
                          key={source.id}
                          className={`rounded-xl border p-4 transition-colors ${
                            selected ? 'border-primary/50 bg-primary/5' : 'bg-background/60 hover:bg-muted/30'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className="rounded-lg bg-red-500/10 p-2 text-red-400">
                              <FileStack className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="font-medium leading-5">{source.title}</p>
                              {source.title !== source.thesisTitle && (
                                <p className="mt-1 truncate text-xs text-muted-foreground">Upload: {source.thesisTitle}</p>
                              )}
                              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                <Badge variant={compatible ? 'outline' : 'destructive'}>
                                  {compatible ? `${compatibleVersions.length} DOCX` : 'Sem versão DOCX'}
                                </Badge>
                                {source.updatedAt && (
                                  <span>{new Date(source.updatedAt).toLocaleDateString('pt-BR')}</span>
                                )}
                              </div>
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant={selected ? 'secondary' : 'outline'}
                            size="sm"
                            className="mt-4 w-full"
                            disabled={!compatible || selected}
                            onClick={() => addSource(source)}
                          >
                            {selected ? (
                              <><CheckCircle2 className="h-4 w-4" /> Adicionado ao livro</>
                            ) : compatible ? (
                              <><Plus className="h-4 w-4" /> Adicionar como capítulo</>
                            ) : (
                              'Necessita de uma versão DOCX'
                            )}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </section>

                <section className="min-w-0 rounded-xl border border-primary/20 bg-primary/[0.025]">
                  <div className="border-b border-primary/10 p-4">
                    <h2 className="font-semibold">Capítulos do novo livro</h2>
                    <p className="text-xs text-muted-foreground">Arraste ou use as setas para definir a ordem de leitura.</p>
                  </div>
                  <div className="min-h-[320px] space-y-3 p-3">
                    {selectedSources.length === 0 ? (
                      <div className="flex min-h-[290px] flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
                        <BookOpen className="mb-3 h-9 w-9 text-muted-foreground/50" />
                        <p className="font-medium">O livro ainda está vazio</p>
                        <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                          Use “Adicionar como capítulo” nos uploads ao lado. Você poderá reorganizá-los aqui.
                        </p>
                      </div>
                    ) : selectedSources.map((source, index) => {
                      const versions = docxVersions(source);
                      return (
                        <div
                          key={source.id}
                          draggable
                          onDragStart={() => setDraggedId(source.id)}
                          onDragEnd={() => setDraggedId(null)}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={() => dropSource(source.id)}
                          className={`rounded-xl border bg-background p-3 shadow-sm transition-opacity ${
                            draggedId === source.id ? 'opacity-50' : ''
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <GripVertical className="mt-2 h-5 w-5 shrink-0 cursor-grab text-muted-foreground" />
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                              {index + 1}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="font-medium leading-5">{source.title}</p>
                              <p className="mt-1 text-xs text-muted-foreground">Será o capítulo {index + 1}</p>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label={`Remover ${source.title}`}
                              onClick={() => removeSource(source.id)}
                            >
                              <Trash2 className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          </div>
                          <div className="mt-3 flex flex-col gap-2 pl-0 sm:flex-row sm:items-center sm:pl-[76px]">
                            <Select
                              value={versionIds[source.id] || ''}
                              onValueChange={(value) => setVersionIds((current) => ({ ...current, [source.id]: value }))}
                            >
                              <SelectTrigger className="min-w-0 flex-1">
                                <SelectValue placeholder="Escolha a versão" />
                              </SelectTrigger>
                              <SelectContent>
                                {versions.map((version) => (
                                  <SelectItem key={version.id} value={version.id}>
                                    {chapterVersionLabel(version)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <div className="flex shrink-0 gap-1">
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                aria-label="Mover capítulo para cima"
                                onClick={() => moveSource(source.id, -1)}
                                disabled={index === 0}
                              >
                                <ArrowUp className="h-4 w-4" />
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                aria-label="Mover capítulo para baixo"
                                onClick={() => moveSource(source.id, 1)}
                                disabled={index === selectedSources.length - 1}
                              >
                                <ArrowDown className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.7fr)]">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-xl">2. Escolha o tipo de montagem</CardTitle>
                  <CardDescription>O modo conservador é recomendado para uploads que já foram revisados.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-3">
                  {MODE_OPTIONS.map((option) => {
                    const Icon = option.icon;
                    const selected = mode === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setMode(option.value)}
                        className={`rounded-lg border p-4 text-left transition-colors ${
                          selected ? 'border-primary bg-primary/10' : 'hover:bg-muted/40'
                        }`}
                      >
                        <div className="mb-3 flex items-center justify-between">
                          <Icon className={`h-5 w-5 ${selected ? 'text-primary' : 'text-muted-foreground'}`} />
                          {selected && <CheckCircle2 className="h-4 w-4 text-primary" />}
                        </div>
                        <p className="font-semibold">{option.title}</p>
                        <p className="mt-2 text-xs leading-5 text-muted-foreground">{option.description}</p>
                      </button>
                    );
                  })}
                </CardContent>
              </Card>

              {mode !== 'compile' && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-xl">3. Direção editorial</CardTitle>
                    <CardDescription>
                      Primeiro será apresentado um plano para aprovação. Os uploads originais nunca serão alterados.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {availableProviders.length > 0 ? (
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Provedor</Label>
                          <Select value={provider} onValueChange={(value) => handleProviderChange(value as AIProvider)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {availableProviders.map((item) => (
                                <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Modelo</Label>
                          <Select value={model} onValueChange={setModel}>
                            <SelectTrigger><SelectValue placeholder="Escolha o modelo" /></SelectTrigger>
                            <SelectContent>
                              {(settings?.models[provider] || []).map((item) => (
                                <SelectItem key={item} value={item}>{item}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-sm text-amber-700 dark:text-amber-300">Configure ao menos um provedor de IA antes de harmonizar o livro.</p>
                        <Button asChild variant="outline" size="sm">
                          <Link href="/settings"><Settings className="h-4 w-4" /> Configurações</Link>
                        </Button>
                      </div>
                    )}
                    <div className="space-y-2">
                      <Label htmlFor="editorial-instructions">Instruções adicionais do autor</Label>
                      <Textarea
                        id="editorial-instructions"
                        value={customInstructions}
                        onChange={(event) => setCustomInstructions(event.target.value)}
                        rows={5}
                        placeholder="Ex.: preservar a terminologia jurídica; criar transições curtas entre os capítulos 2 e 3..."
                      />
                      <p className="text-xs text-muted-foreground">
                        A regra padrão é manter o texto em pt-BR e fazer somente as intervenções necessárias.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            <Card className="h-fit xl:sticky xl:top-6">
              <CardHeader>
                <CardTitle className="text-xl">Novo livro</CardTitle>
                <CardDescription>O resultado será criado como um documento independente.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="book-title">Título do livro</Label>
                  <Input
                    id="book-title"
                    value={bookTitle}
                    onChange={(event) => setBookTitle(event.target.value)}
                    placeholder="Ex.: Centros Offshore"
                  />
                </div>
                <div className="rounded-lg bg-muted/40 p-4 text-sm">
                  <div className="flex justify-between gap-4 py-1">
                    <span className="text-muted-foreground">Capítulos</span>
                    <span className="font-medium">{selectedCount}</span>
                  </div>
                  <div className="flex justify-between gap-4 py-1">
                    <span className="text-muted-foreground">Modo</span>
                    <span className="text-right font-medium">
                      {MODE_OPTIONS.find((option) => option.value === mode)?.title}
                    </span>
                  </div>
                  {mode !== 'compile' && (
                    <div className="flex justify-between gap-4 py-1">
                      <span className="text-muted-foreground">IA</span>
                      <span className="max-w-[190px] truncate text-right font-medium">{provider}/{model || '—'}</span>
                    </div>
                  )}
                </div>
                <label className="flex items-start gap-3 rounded-lg border p-3">
                  <Checkbox checked={includeCoverPage} onCheckedChange={(checked) => setIncludeCoverPage(checked === true)} />
                  <span>
                    <span className="block text-sm font-medium">Incluir página de capa</span>
                    <span className="block text-xs text-muted-foreground">Usa o título informado acima.</span>
                  </span>
                </label>
                <Button
                  className="w-full"
                  size="lg"
                  onClick={() => void startAssembly()}
                  disabled={
                    starting
                    || selectedCount === 0
                    || !bookTitle.trim()
                    || (mode !== 'compile' && (!model || availableProviders.length === 0))
                  }
                >
                  {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookOpen className="h-4 w-4" />}
                  {mode === 'compile' ? 'Criar e compilar livro' : 'Criar e analisar livro'}
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  Os documentos de origem e seus históricos permanecem intactos.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {jobs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Clock3 className="h-5 w-5" /> Histórico de livros
            </CardTitle>
            <CardDescription>Reabra uma montagem, continue aprovações ou baixe uma versão concluída.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {jobs.map((job) => (
              <button
                key={job.id}
                type="button"
                onClick={() => setActiveJob(job)}
                className={`flex w-full flex-col gap-2 rounded-lg border p-3 text-left transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between ${
                  activeJob?.id === job.id ? 'border-primary bg-primary/5' : ''
                }`}
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{job.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(job.createdAt).toLocaleString('pt-BR')} · {job.chapterSelections.length} capítulo{job.chapterSelections.length === 1 ? '' : 's'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{job.progress}%</span>
                  <Badge variant={job.status === 'failed' ? 'destructive' : job.status === 'completed' ? 'default' : 'secondary'}>
                    {historyStatus(job)}
                  </Badge>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
