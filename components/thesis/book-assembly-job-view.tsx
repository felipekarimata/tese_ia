'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BookCheck,
  CheckCircle2,
  Download,
  Loader2,
  RefreshCw,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import type { BookAssemblyJob, BookSuggestionKind } from '@/lib/book-assembly/types';

const STATUS_LABELS: Record<BookAssemblyJob['status'], string> = {
  queued: 'Na fila',
  analyzing: 'Analisando',
  awaiting_plan_approval: 'Aguardando aprovação do plano',
  harmonizing: 'Harmonizando',
  awaiting_changes_approval: 'Aguardando revisão das alterações',
  finalizing: 'Gerando livro',
  completed: 'Concluído',
  failed: 'Interrompido',
  cancelled: 'Cancelado',
};

const KIND_LABELS: Record<BookSuggestionKind, string> = {
  transition: 'Transição',
  terminology: 'Terminologia',
  repetition: 'Repetição',
  cohesion: 'Coesão',
  structure: 'Estrutura',
  addition: 'Adição conectiva',
  language: 'Idioma',
};

const RUNNING = new Set<BookAssemblyJob['status']>([
  'queued', 'analyzing', 'harmonizing', 'finalizing',
]);

type Props = {
  thesisId: string;
  job: BookAssemblyJob;
  onRefresh: () => Promise<void>;
  onNew: () => void;
};

export function BookAssemblyJobView({ thesisId, job, onRefresh, onNew }: Props) {
  const [busy, setBusy] = useState(false);
  const allSuggestionIds = useMemo(
    () => job.chapterResults.flatMap((result) => result.suggestions.map((suggestion) => suggestion.id)),
    [job.chapterResults]
  );
  const [approvedIds, setApprovedIds] = useState<Set<string>>(new Set(allSuggestionIds));

  useEffect(() => {
    setApprovedIds(new Set(allSuggestionIds));
  }, [job.id, allSuggestionIds.join('|')]);

  const postAction = async (action: 'approve-plan' | 'finalize' | 'resume', body?: unknown) => {
    try {
      setBusy(true);
      const response = await fetch(
        `/api/theses/${thesisId}/book-assembly/${job.id}/${action}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body),
        }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível continuar a montagem');
      toast.success(
        action === 'approve-plan'
          ? 'Plano aprovado. A harmonização começou.'
          : action === 'finalize'
            ? 'Alterações aprovadas. O livro está sendo gerado.'
            : 'Processamento retomado.'
      );
      await onRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const toggleSuggestion = (id: string, checked: boolean) => {
    setApprovedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const downloadUrl = job.resultThesisVersionId
    ? `/api/theses/${thesisId}/versions/${job.resultThesisVersionId}/download`
    : null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-xl">{job.title}</CardTitle>
                <Badge variant={job.status === 'failed' ? 'destructive' : job.status === 'completed' ? 'default' : 'secondary'}>
                  {STATUS_LABELS[job.status]}
                </Badge>
              </div>
              <CardDescription>
                {job.chapterSelections.length} capítulo{job.chapterSelections.length === 1 ? '' : 's'} · {
                  job.mode === 'compile' ? 'Somente compilar' : job.mode === 'structural' ? 'Edição estrutural' : 'Harmonização conservadora'
                }
                {job.provider && job.model ? ` · ${job.provider}/${job.model}` : ''}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              {job.canResume && RUNNING.has(job.status) && (
                <Button variant="outline" size="sm" onClick={() => void postAction('resume')} disabled={busy}>
                  <RotateCcw className="h-4 w-4" /> Retomar
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => void onRefresh()} disabled={busy}>
                <RefreshCw className="h-4 w-4" /> Atualizar
              </Button>
              <Button variant="ghost" size="sm" onClick={onNew} disabled={busy}>
                Nova montagem
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <Progress value={job.progress} />
          <div className="flex items-center justify-between gap-4 text-sm">
            <span className="flex items-center gap-2 text-muted-foreground">
              {RUNNING.has(job.status) && <Loader2 className="h-4 w-4 animate-spin" />}
              {job.progressLabel || STATUS_LABELS[job.status]}
            </span>
            <span className="font-medium tabular-nums">{job.progress}%</span>
          </div>
          {RUNNING.has(job.status) && (
            <p className="text-xs text-muted-foreground">
              O trabalho fica salvo por etapas. Você pode sair desta página e voltar depois.
            </p>
          )}
        </CardContent>
      </Card>

      {job.status === 'awaiting_plan_approval' && job.editorialPlan && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Sparkles className="h-5 w-5 text-amber-500" /> Plano editorial
            </CardTitle>
            <CardDescription>
              Confira o diagnóstico antes de autorizar qualquer alteração nos capítulos.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <section className="space-y-2">
              <h3 className="font-semibold">Diagnóstico geral</h3>
              <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                {job.editorialPlan.overview}
              </p>
            </section>
            {job.editorialPlan.centralThesis && (
              <section className="space-y-2">
                <h3 className="font-semibold">Fio condutor</h3>
                <p className="text-sm leading-6 text-muted-foreground">{job.editorialPlan.centralThesis}</p>
              </section>
            )}
            {job.editorialPlan.proposedStructure && (
              <section className="space-y-2">
                <h3 className="font-semibold">Estrutura proposta</h3>
                <p className="text-sm leading-6 text-muted-foreground">{job.editorialPlan.proposedStructure}</p>
              </section>
            )}
            {job.editorialPlan.globalIssues.length > 0 && (
              <section className="space-y-3">
                <h3 className="font-semibold">Pontos a harmonizar</h3>
                <div className="grid gap-3 md:grid-cols-2">
                  {job.editorialPlan.globalIssues.map((issue, index) => (
                    <div key={`${issue.type}-${index}`} className="rounded-lg border bg-muted/30 p-3">
                      <Badge variant="outline" className="mb-2">{issue.type}</Badge>
                      <p className="text-sm leading-5">{issue.description}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}
            {job.editorialPlan.terminology.length > 0 && (
              <section className="space-y-3">
                <h3 className="font-semibold">Terminologia a padronizar</h3>
                <div className="grid gap-2 md:grid-cols-2">
                  {job.editorialPlan.terminology.map((term, index) => (
                    <div key={`${term.preferred}-${index}`} className="rounded-lg border p-3 text-sm">
                      <p className="font-medium">{term.preferred}</p>
                      {term.avoid.length > 0 && (
                        <p className="mt-1 text-xs text-muted-foreground">Evitar: {term.avoid.join(', ')}</p>
                      )}
                      {term.note && <p className="mt-2 text-muted-foreground">{term.note}</p>}
                    </div>
                  ))}
                </div>
              </section>
            )}
            {job.editorialPlan.proposedAdditions.length > 0 && (
              <section className="space-y-2">
                <h3 className="font-semibold">Adições conectivas propostas</h3>
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  {job.editorialPlan.proposedAdditions.map((addition, index) => (
                    <li key={index}>{addition}</li>
                  ))}
                </ul>
              </section>
            )}
            <section className="space-y-3">
              <h3 className="font-semibold">Orientação por capítulo</h3>
              <div className="space-y-2">
                {job.editorialPlan.chapterGuidance.map((chapter, index) => (
                  <details key={chapter.chapterId || index} className="rounded-lg border bg-muted/20 p-4">
                    <summary className="cursor-pointer font-medium">
                      {index + 1}. {chapter.title}
                    </summary>
                    <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                      {chapter.role && <p><span className="font-medium text-foreground">Função:</span> {chapter.role}</p>}
                      {chapter.recommendedChanges.length > 0 && (
                        <ul className="list-disc space-y-1 pl-5">
                          {chapter.recommendedChanges.map((change, changeIndex) => (
                            <li key={changeIndex}>{change}</li>
                          ))}
                        </ul>
                      )}
                      {chapter.transitionIn && <p><span className="font-medium text-foreground">Entrada:</span> {chapter.transitionIn}</p>}
                      {chapter.transitionOut && <p><span className="font-medium text-foreground">Saída:</span> {chapter.transitionOut}</p>}
                    </div>
                  </details>
                ))}
              </div>
            </section>
            <div className="flex justify-end border-t pt-4">
              <Button onClick={() => void postAction('approve-plan')} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookCheck className="h-4 w-4" />}
                Aprovar plano e harmonizar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {job.status === 'awaiting_changes_approval' && (
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="text-xl">Revisar alterações</CardTitle>
                <CardDescription className="mt-2">
                  {allSuggestionIds.length} alteração{allSuggestionIds.length === 1 ? '' : 'ões'} proposta{allSuggestionIds.length === 1 ? '' : 's'}. Selecione somente as que devem entrar no livro.
                </CardDescription>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={approvedIds.size === allSuggestionIds.length && allSuggestionIds.length > 0}
                  onCheckedChange={(checked) => setApprovedIds(checked ? new Set(allSuggestionIds) : new Set())}
                />
                Selecionar todas
              </label>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {job.chapterResults.map((chapter) => (
              <details key={chapter.chapterId} open={chapter.suggestions.length > 0} className="rounded-lg border">
                <summary className="cursor-pointer px-4 py-3 font-medium">
                  {chapter.order}. {chapter.chapterTitle} · {chapter.suggestions.length} alteração{chapter.suggestions.length === 1 ? '' : 'ões'}
                </summary>
                <div className="space-y-4 border-t p-4">
                  {chapter.warnings.map((warning, index) => (
                    <div key={index} className="flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {warning}
                    </div>
                  ))}
                  {chapter.suggestions.length === 0 && (
                    <p className="text-sm text-muted-foreground">Nenhuma alteração necessária neste capítulo.</p>
                  )}
                  {chapter.suggestions.map((suggestion) => (
                    <div key={suggestion.id} className="rounded-lg border bg-muted/10 p-4">
                      <div className="mb-3 flex items-start gap-3">
                        <Checkbox
                          checked={approvedIds.has(suggestion.id)}
                          onCheckedChange={(checked) => toggleSuggestion(suggestion.id, checked === true)}
                        />
                        <div className="flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline">{KIND_LABELS[suggestion.kind]}</Badge>
                            <span className="text-xs text-muted-foreground">Parágrafo {suggestion.paragraphIndex + 1}</span>
                          </div>
                          <p className="mt-2 text-sm text-muted-foreground">{suggestion.reason}</p>
                        </div>
                      </div>
                      <div className="grid gap-3 lg:grid-cols-2">
                        <div className="rounded-md border border-red-500/20 bg-red-500/5 p-3">
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">Original</p>
                          <p className="whitespace-pre-wrap text-sm leading-6">{suggestion.originalText}</p>
                        </div>
                        <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3">
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">Proposta</p>
                          <p className="whitespace-pre-wrap text-sm leading-6">{suggestion.improvedText}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            ))}
            <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                {approvedIds.size} de {allSuggestionIds.length} alterações selecionadas
              </p>
              <Button
                onClick={() => void postAction('finalize', { approvedSuggestionIds: [...approvedIds] })}
                disabled={busy}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookCheck className="h-4 w-4" />}
                Aprovar e gerar livro
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {job.status === 'failed' && (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg text-destructive">
              <AlertCircle className="h-5 w-5" /> Processamento interrompido
            </CardTitle>
            <CardDescription>{job.errorMessage || 'Ocorreu um erro durante a montagem.'}</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-end">
            {job.canResume && (
              <Button onClick={() => void postAction('resume')} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                Retomar da última etapa
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {job.status === 'completed' && (
        <Card className="border-emerald-500/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <CheckCircle2 className="h-6 w-6 text-emerald-500" /> Livro concluído
            </CardTitle>
            <CardDescription>
              Uma nova versão do livro foi criada sem alterar as versões originais dos capítulos.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {job.finalizationReport && (
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border p-3">
                  <p className="text-2xl font-semibold">{job.finalizationReport.chaptersProcessed}</p>
                  <p className="text-xs text-muted-foreground">capítulos reunidos</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-2xl font-semibold">{job.finalizationReport.appliedSuggestions}</p>
                  <p className="text-xs text-muted-foreground">alterações aplicadas</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-2xl font-semibold">{job.finalizationReport.unmatchedSuggestions}</p>
                  <p className="text-xs text-muted-foreground">alterações não localizadas</p>
                </div>
              </div>
            )}
            {job.finalizationReport && job.finalizationReport.unmatchedSuggestions > 0 && (
              <div className="flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                As demais alterações foram aplicadas normalmente e o livro foi criado. As não localizadas ficaram registradas neste relatório.
              </div>
            )}
            <div className="flex justify-end">
              {downloadUrl && (
                <Button asChild>
                  <a href={downloadUrl}>
                    <Download className="h-4 w-4" /> Baixar livro em DOCX
                  </a>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
