'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BookOpen,
  CheckCircle2,
  Clock3,
  FileStack,
  GripVertical,
  Layers3,
  Loader2,
  Settings,
  Sparkles,
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

type ChapterVersion = {
  id: string;
  versionNumber: number;
  filePath: string;
  pages: number | null;
  createdByOperation: string;
  metadata?: Record<string, unknown>;
  isCurrent: boolean;
};

type Chapter = {
  id: string;
  title: string;
  chapterOrder: number;
  currentVersion: ChapterVersion | null;
  versions: ChapterVersion[];
};

type Thesis = {
  id: string;
  title: string;
  description?: string;
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

function isDocx(version: ChapterVersion): boolean {
  return version.filePath.toLowerCase().endsWith('.docx');
}

function historyStatus(job: BookAssemblyJob) {
  if (job.status === 'completed') return 'Concluído';
  if (job.status === 'failed') return 'Interrompido';
  if (job.status === 'awaiting_plan_approval') return 'Aprovar plano';
  if (job.status === 'awaiting_changes_approval') return 'Revisar alterações';
  return job.progressLabel || 'Em processamento';
}

export function BookAssemblyWorkspace({ thesisId }: { thesisId: string }) {
  const [thesis, setThesis] = useState<Thesis | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [jobs, setJobs] = useState<BookAssemblyJob[]>([]);
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [activeJob, setActiveJob] = useState<BookAssemblyJob | null>(null);

  const [bookTitle, setBookTitle] = useState('');
  const [mode, setMode] = useState<BookAssemblyMode>('harmonize');
  const [includeCoverPage, setIncludeCoverPage] = useState(true);
  const [customInstructions, setCustomInstructions] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [versionIds, setVersionIds] = useState<Record<string, string>>({});
  const [chapterOrder, setChapterOrder] = useState<string[]>([]);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [provider, setProvider] = useState<AIProvider>('openai');
  const [model, setModel] = useState('');

  const availableProviders = useMemo(() => {
    if (!settings) return [];
    return PROVIDERS.filter(
      (item) => Boolean(settings[item.keyField]) && (settings.models[item.value]?.length || 0) > 0
    );
  }, [settings]);

  const orderedChapters = useMemo(() => {
    const map = new Map(chapters.map((chapter) => [chapter.id, chapter]));
    return chapterOrder.map((id) => map.get(id)).filter((chapter): chapter is Chapter => Boolean(chapter));
  }, [chapters, chapterOrder]);

  const selectedCount = [...selectedIds].filter((id) => versionIds[id]).length;

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    try {
      const [thesisResponse, settingsResponse, jobsResponse] = await Promise.all([
        fetch(`/api/theses/${thesisId}`, { cache: 'no-store' }),
        fetch('/api/settings', { cache: 'no-store' }),
        fetch(`/api/theses/${thesisId}/book-assembly`, { cache: 'no-store' }),
      ]);
      const [thesisData, settingsData, jobsData] = await Promise.all([
        thesisResponse.json(), settingsResponse.json(), jobsResponse.json(),
      ]);
      if (!thesisResponse.ok) throw new Error(thesisData.error || 'Falha ao carregar a tese');
      if (!settingsResponse.ok) throw new Error(settingsData.error || 'Falha ao carregar configurações');
      if (!jobsResponse.ok) throw new Error(jobsData.error || 'Falha ao carregar montagens');

      const baseChapters = thesisData.chapters || [];
      const chaptersWithVersions: Chapter[] = await Promise.all(
        baseChapters.map(async (chapter: any) => {
          const response = await fetch(`/api/chapters/${chapter.id}/versions`, { cache: 'no-store' });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || `Falha ao carregar versões de ${chapter.title}`);
          return {
            id: chapter.id,
            title: chapter.title,
            chapterOrder: chapter.chapterOrder,
            currentVersion: chapter.currentVersion,
            versions: data.versions || [],
          };
        })
      );

      const sorted = chaptersWithVersions.sort((a, b) => a.chapterOrder - b.chapterOrder);
      const initialVersions: Record<string, string> = {};
      const initialSelected = new Set<string>();
      for (const chapter of sorted) {
        const docxVersions = chapter.versions.filter(isDocx);
        const preferred = docxVersions.find((version) => version.isCurrent) || docxVersions[0];
        if (preferred) {
          initialVersions[chapter.id] = preferred.id;
          initialSelected.add(chapter.id);
        }
      }

      setThesis(thesisData.thesis);
      setBookTitle((current) => current || thesisData.thesis.title);
      setChapters(sorted);
      setChapterOrder(sorted.map((chapter) => chapter.id));
      setVersionIds(initialVersions);
      setSelectedIds(initialSelected);
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
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, [thesisId]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  const refreshActiveJob = useCallback(async () => {
    if (!activeJob) return;
    const response = await fetch(
      `/api/theses/${thesisId}/book-assembly/${activeJob.id}`,
      { cache: 'no-store' }
    );
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Falha ao atualizar a montagem');
    setActiveJob(data.job);
    setJobs((current) => [data.job, ...current.filter((job) => job.id !== data.job.id)]);
  }, [activeJob?.id, thesisId]);

  useEffect(() => {
    if (!activeJob || !ACTIVE_STATUSES.has(activeJob.status)) return;
    const timer = window.setInterval(() => {
      void refreshActiveJob().catch((error) => console.error('[BOOK-ASSEMBLY-UI] Poll failed:', error));
    }, 3000);
    return () => window.clearInterval(timer);
  }, [activeJob?.id, activeJob?.status, refreshActiveJob]);

  const handleProviderChange = (value: AIProvider) => {
    setProvider(value);
    setModel(settings?.models[value]?.[0] || '');
  };

  const moveChapter = (chapterId: string, delta: number) => {
    setChapterOrder((current) => {
      const index = current.indexOf(chapterId);
      const target = index + delta;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const dropChapter = (targetId: string) => {
    if (!draggedId || draggedId === targetId) return;
    setChapterOrder((current) => {
      const next = current.filter((id) => id !== draggedId);
      const targetIndex = next.indexOf(targetId);
      next.splice(targetIndex, 0, draggedId);
      return next;
    });
    setDraggedId(null);
  };

  const startAssembly = async () => {
    if (selectedCount === 0) {
      toast.error('Selecione pelo menos um capítulo com versão DOCX');
      return;
    }
    if (mode !== 'compile' && (!provider || !model)) {
      toast.error('Selecione o provedor e o modelo de IA');
      return;
    }

    try {
      setStarting(true);
      const selections = orderedChapters
        .filter((chapter) => selectedIds.has(chapter.id) && versionIds[chapter.id])
        .map((chapter, index) => ({
          chapterId: chapter.id,
          versionId: versionIds[chapter.id],
          order: index + 1,
        }));
      const response = await fetch(`/api/theses/${thesisId}/book-assembly`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: bookTitle,
          mode,
          provider: mode === 'compile' ? undefined : provider,
          model: mode === 'compile' ? undefined : model,
          customInstructions,
          includeCoverPage,
          chapterSelections: selections,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Falha ao iniciar a montagem');
      setActiveJob(data.job);
      setJobs((current) => [data.job, ...current.filter((job) => job.id !== data.job.id)]);
      toast.success(
        mode === 'compile'
          ? 'Compilação iniciada.'
          : 'Análise editorial iniciada. Você pode acompanhar o progresso aqui.'
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setStarting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" /> Carregando a montagem do livro...
      </div>
    );
  }

  if (!thesis) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-4 flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href={`/theses/${thesisId}`}>
                <ArrowLeft className="h-4 w-4" /> Capítulos
              </Link>
            </Button>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-primary/10 p-2.5">
              <BookOpen className="h-7 w-7 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">Montar livro</h1>
              <p className="mt-1 text-muted-foreground">{thesis.title}</p>
            </div>
          </div>
        </div>
        <div className="flex rounded-lg border bg-muted/30 p-1">
          <Button asChild variant="ghost" size="sm">
            <Link href={`/theses/${thesisId}`}>Capítulos</Link>
          </Button>
          <Button variant="secondary" size="sm">Montar livro</Button>
        </div>
      </div>

      {activeJob ? (
        <BookAssemblyJobView
          thesisId={thesisId}
          job={activeJob}
          onRefresh={refreshActiveJob}
          onNew={() => setActiveJob(null)}
        />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.7fr)]">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <Layers3 className="h-5 w-5" /> 1. Escolha e ordene os capítulos
                </CardTitle>
                <CardDescription>
                  Selecione uma versão DOCX de cada capítulo e arraste para definir a ordem do livro.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {orderedChapters.map((chapter, index) => {
                  const docxVersions = chapter.versions.filter(isDocx);
                  const enabled = selectedIds.has(chapter.id);
                  return (
                    <div
                      key={chapter.id}
                      draggable
                      onDragStart={() => setDraggedId(chapter.id)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => dropChapter(chapter.id)}
                      className={`flex flex-col gap-3 rounded-lg border p-3 transition-colors sm:flex-row sm:items-center ${
                        enabled ? 'bg-muted/30' : 'opacity-60'
                      }`}
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <GripVertical className="h-5 w-5 shrink-0 cursor-grab text-muted-foreground" />
                        <Checkbox
                          checked={enabled}
                          disabled={docxVersions.length === 0}
                          onCheckedChange={(checked) => {
                            setSelectedIds((current) => {
                              const next = new Set(current);
                              if (checked) next.add(chapter.id);
                              else next.delete(chapter.id);
                              return next;
                            });
                          }}
                        />
                        <div className="min-w-0">
                          <p className="truncate font-medium">
                            {index + 1}. {chapter.title}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {docxVersions.length > 0
                              ? `${docxVersions.length} versão${docxVersions.length === 1 ? '' : 'ões'} DOCX`
                              : 'Nenhuma versão DOCX disponível'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Select
                          value={versionIds[chapter.id] || ''}
                          disabled={!enabled || docxVersions.length === 0}
                          onValueChange={(value) => setVersionIds((current) => ({ ...current, [chapter.id]: value }))}
                        >
                          <SelectTrigger className="w-[260px] max-w-full">
                            <SelectValue placeholder="Escolha a versão" />
                          </SelectTrigger>
                          <SelectContent>
                            {docxVersions.map((version) => (
                              <SelectItem key={version.id} value={version.id}>
                                {chapterVersionLabel(version)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button variant="ghost" size="icon" onClick={() => moveChapter(chapter.id, -1)} disabled={index === 0}>
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => moveChapter(chapter.id, 1)} disabled={index === orderedChapters.length - 1}>
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-xl">2. Escolha o tipo de montagem</CardTitle>
                <CardDescription>O modo conservador é a opção recomendada para capítulos já revisados.</CardDescription>
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
                    O sistema primeiro apresentará um plano para sua aprovação. Nenhum capítulo será alterado nesta etapa.
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
                      placeholder="Ex.: preservar a terminologia jurídica já adotada; aproximar o fechamento do capítulo 2 da abertura do capítulo 3..."
                    />
                    <p className="text-xs text-muted-foreground">
                      A regra padrão é manter o texto em pt-BR e fazer somente as intervenções necessárias.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="space-y-6">
            <Card className="xl:sticky xl:top-6">
              <CardHeader>
                <CardTitle className="text-xl">Resumo da montagem</CardTitle>
                <CardDescription>Revise as opções antes de começar.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="book-title">Título do livro</Label>
                  <Input id="book-title" value={bookTitle} onChange={(event) => setBookTitle(event.target.value)} />
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
                  disabled={starting || selectedCount === 0 || (mode !== 'compile' && (!model || availableProviders.length === 0))}
                >
                  {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookOpen className="h-4 w-4" />}
                  {mode === 'compile' ? 'Compilar livro' : 'Analisar e montar livro'}
                </Button>
                {mode !== 'compile' && (
                  <p className="text-center text-xs text-muted-foreground">
                    A análise pode demorar em livros extensos, mas o progresso fica salvo.
                  </p>
                )}
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
