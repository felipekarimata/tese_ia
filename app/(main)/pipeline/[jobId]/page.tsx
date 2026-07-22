'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ProcessingProgressBar } from '@/components/processing-screen';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Download,
  Loader2,
  CheckCircle2,
  Circle,
  Pause,
  Play,
  X,
  AlertCircle
} from 'lucide-react';
import {
  PipelineJob,
  PipelineIntermediateDocument,
  OPERATION_METADATA,
  OperationResult,
  PipelineOperation
} from '@/lib/pipeline/types';
import { getAIErrorMessage } from '@/lib/ai-error-message';

const TERMINAL_STATUSES = ['completed', 'failed', 'cancelled'];

function resultIndex(r: OperationResult & { operation_index?: number }): number {
  return r.operationIndex ?? (r as { operation_index?: number }).operation_index ?? -1;
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    pending: 'Na fila',
    running: 'Em andamento',
    paused: 'Pausado',
    awaiting_approval: 'Sua revisão',
    applying_changes: 'Aplicando alterações',
    completed: 'Concluído',
    failed: 'Erro',
    cancelled: 'Cancelado'
  };
  return map[status] || status;
}

export default function PipelinePage() {
  const params = useParams();
  const router = useRouter();
  const jobId = params.jobId as string;

  const [job, setJob] = useState<PipelineJob | null>(null);
  const [intermediateDocuments, setIntermediateDocuments] = useState<PipelineIntermediateDocument[]>([]);
  const [currentOperationProgress, setCurrentOperationProgress] = useState<
    { percentage: number; message?: string } | undefined
  >(undefined);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const jobRef = useRef<PipelineJob | null>(null);
  jobRef.current = job;

  const loadPipelineStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/pipeline/${jobId}`, { cache: 'no-store' });
      if (!res.ok) {
        throw new Error('Pipeline não encontrado');
      }

      const data = await res.json();
      setJob(data.job);
      setIntermediateDocuments(data.intermediateDocuments || []);
      setCurrentOperationProgress(data.currentOperationProgress);
    } catch (error: any) {
      console.error('Error loading pipeline:', error);
      toast.error(getAIErrorMessage(error, 'Falha ao carregar'));
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    loadPipelineStatus();
  }, [loadPipelineStatus]);

  useEffect(() => {
    const id = setInterval(() => {
      const j = jobRef.current;
      if (!j || TERMINAL_STATUSES.includes(j.status)) return;
      loadPipelineStatus();
    }, 2000);
    return () => clearInterval(id);
  }, [loadPipelineStatus]);

  const handlePause = async () => {
    try {
      setActionLoading(true);
      const res = await fetch(`/api/pipeline/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'pause' })
      });

      if (!res.ok) throw new Error('Falha ao pausar');
      toast.success('Pausado');
      loadPipelineStatus();
    } catch (error: any) {
      toast.error(getAIErrorMessage(error));
    } finally {
      setActionLoading(false);
    }
  };

  const handleResume = async () => {
    try {
      setActionLoading(true);
      const res = await fetch(`/api/pipeline/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resume' })
      });

      if (!res.ok) throw new Error('Falha ao retomar');
      toast.success('Retomado');
      loadPipelineStatus();
    } catch (error: any) {
      toast.error(getAIErrorMessage(error));
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!confirm('Cancelar o processamento?')) return;

    try {
      setActionLoading(true);
      const res = await fetch(`/api/pipeline/${jobId}`, {
        method: 'DELETE'
      });

      if (!res.ok) throw new Error('Falha ao cancelar');
      toast.success('Cancelado');
      loadPipelineStatus();
    } catch (error: any) {
      toast.error(getAIErrorMessage(error));
    } finally {
      setActionLoading(false);
    }
  };

  const handleDownload = async (type: 'final' | 'intermediate', index?: number) => {
    try {
      const url =
        type === 'final'
          ? `/api/pipeline/${jobId}/download?type=final`
          : `/api/pipeline/${jobId}/download?type=intermediate&index=${index}`;

      const res = await fetch(url);
      if (!res.ok) throw new Error('Falha ao baixar');

      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `documento_${type === 'final' ? 'final' : `etapa_${index}`}.docx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
      document.body.removeChild(a);

      toast.success('Download iniciado');
    } catch (error: any) {
      toast.error(getAIErrorMessage(error));
    }
  };

  const goToApproval = (operation: PipelineOperation, operationJobId: string) => {
    const pathMap: Record<string, string> = {
      improve: 'improvements',
      update: 'norms-update',
      translate: 'translations',
      adjust: 'adjustments',
      adapt: 'adaptations'
    };
    const path = pathMap[operation] || operation;
    router.push(`/${path}/${operationJobId}?pipeline=${jobId}`);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <Loader2 className="h-10 w-10 animate-spin text-red-500" />
        <p className="text-sm text-muted-foreground">Carregando…</p>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground mb-4">Não encontrado</p>
        <Button onClick={() => router.push('/')}>Voltar</Button>
      </div>
    );
  }

  const ops = job.selected_operations;
  const total = ops.length;
  const curIdx = job.current_operation_index;
  const doneCount = ops.filter((_, i) => {
    const r = job.operation_results.find((res) => resultIndex(res as OperationResult) === i);
    return r?.status === 'completed';
  }).length;

  const stepsAfterCurrent =
    job.status === 'running' && total > 1 ? Math.max(0, total - curIdx - 1) : 0;
  const stepsRemainingLabel =
    stepsAfterCurrent > 0
      ? `Depois desta, ${stepsAfterCurrent} etapa(s) ainda na fila.`
      : job.status === 'running' && total > 1 && curIdx >= total - 1
        ? 'Última etapa em execução.'
        : null;

  const overallPct =
    total === 0
      ? 0
      : Math.min(
          100,
          Math.round(
            (doneCount / total) * 100 +
              (job.status === 'running' && currentOperationProgress
                ? (currentOperationProgress.percentage / 100) * (100 / total)
                : 0)
          )
        );

  const currentOp = curIdx < total ? ops[curIdx] : null;
  const showLiveProgress =
    job.status === 'running' &&
    currentOp &&
    currentOperationProgress &&
    (!currentOperationProgress.operation || currentOperationProgress.operation === currentOp);

  return (
    <div className="space-y-8 max-w-2xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Button variant="ghost" size="sm" className="-ml-2 mb-2" onClick={() => router.push('/')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">Processamento</h1>
          <p className="text-sm text-muted-foreground">
            {total === 1
              ? 'Uma etapa neste documento'
              : `${total} etapas neste documento`}
            {stepsRemainingLabel && <span className="block mt-1">{stepsRemainingLabel}</span>}
          </p>
        </div>
        <StatusBadge status={job.status} />
      </div>

      {!TERMINAL_STATUSES.includes(job.status) && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Andamento geral</span>
            <span className="font-medium tabular-nums">{overallPct}%</span>
          </div>
          <ProcessingProgressBar value={overallPct} />
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Etapas</CardTitle>
          <CardDescription>
            {job.status === 'running' && currentOp
              ? `Agora: ${OPERATION_METADATA[currentOp].name}`
              : job.status === 'awaiting_approval'
                ? 'Uma etapa precisa da sua confirmação'
                : 'Ordem do processamento'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-0">
          <ol className="space-y-0">
            {ops.map((op, idx) => {
              const meta = OPERATION_METADATA[op];
              const result = job.operation_results.find((r) => resultIndex(r as OperationResult) === idx);
              const isDone = result?.status === 'completed';
              const needsYou = result?.status === 'awaiting_approval';
              const failed = result?.status === 'failed';
              const isCurrent =
                idx === curIdx &&
                (job.status === 'running' || job.status === 'applying_changes' || job.status === 'pending');
              const intermediateDoc = intermediateDocuments.find((d) => d.operation_index === idx);

              const isLiveHere = Boolean(
                showLiveProgress && idx === curIdx && !isDone && !needsYou
              );

              return (
                <li
                  key={`${op}-${idx}`}
                  className="flex gap-3 py-4 border-b border-border/60 last:border-0 first:pt-0"
                >
                  <div className="flex-shrink-0 pt-0.5">
                    {isDone ? (
                      <CheckCircle2 className="h-6 w-6 text-green-600" aria-hidden />
                    ) : needsYou ? (
                      <AlertCircle className="h-6 w-6 text-amber-500" aria-hidden />
                    ) : failed ? (
                      <AlertCircle className="h-6 w-6 text-red-500" aria-hidden />
                    ) : isCurrent || isLiveHere ? (
                      <Loader2 className="h-6 w-6 text-red-500 animate-spin" aria-hidden />
                    ) : (
                      <Circle className="h-6 w-6 text-muted-foreground/40" aria-hidden />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-lg mr-1" aria-hidden>
                        {meta.icon}
                      </span>
                      <span className="font-medium">{meta.name}</span>
                      <Badge variant="secondary" className="text-xs font-normal">
                        {isDone
                          ? 'Concluída'
                          : needsYou
                            ? 'Aguardando você'
                            : failed
                              ? 'Erro'
                              : isCurrent || isLiveHere
                                ? job.status === 'pending'
                                  ? 'Iniciando…'
                                  : 'Em andamento'
                                : 'Aguardando'}
                      </Badge>
                    </div>

                    {isLiveHere && currentOperationProgress && (
                      <div className="space-y-2 pl-0.5">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Nesta etapa</span>
                          <span className="tabular-nums">{currentOperationProgress.percentage}%</span>
                        </div>
                        <ProcessingProgressBar value={currentOperationProgress.percentage} trackClassName="h-2" />
                        {currentOperationProgress.message && (
                          <p className="text-sm text-muted-foreground">{currentOperationProgress.message}</p>
                        )}
                      </div>
                    )}

                    {failed && result?.metadata?.error_message && (
                      <p className="text-sm text-red-600 dark:text-red-400">
                        {getAIErrorMessage(String(result.metadata.error_message))}
                      </p>
                    )}

                    {needsYou && result?.operationJobId && (
                      <Button
                        size="sm"
                        className="mt-1 bg-amber-600 hover:bg-amber-700 text-white"
                        onClick={() => goToApproval(op, result.operationJobId!)}
                      >
                        Revisar e continuar
                      </Button>
                    )}

                    {isDone && intermediateDoc && (
                      <Button variant="outline" size="sm" className="mt-1" onClick={() => handleDownload('intermediate', idx)}>
                        <Download className="h-3.5 w-3.5 mr-2" />
                        Baixar resultado desta etapa
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </CardContent>
      </Card>

      {(job.status === 'running' || job.status === 'paused' || job.status === 'awaiting_approval') && (
        <div className="flex flex-wrap gap-2">
          {job.status === 'awaiting_approval' && (() => {
            const opResult = job.operation_results.find((r) => resultIndex(r as OperationResult) === curIdx);
            const op = ops[curIdx];
            if (op && opResult?.operationJobId) {
              return (
                <Button
                  className="bg-green-600 hover:bg-green-700 text-white"
                  onClick={() => goToApproval(op, opResult.operationJobId!)}
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Abrir revisão
                </Button>
              );
            }
            return null;
          })()}
          {job.status === 'running' && (
            <Button variant="outline" onClick={handlePause} disabled={actionLoading}>
              <Pause className="h-4 w-4 mr-2" />
              Pausar
            </Button>
          )}
          {job.status === 'paused' && (
            <Button variant="outline" onClick={handleResume} disabled={actionLoading}>
              <Play className="h-4 w-4 mr-2" />
              Continuar
            </Button>
          )}
          <Button variant="ghost" className="text-destructive" onClick={handleCancel} disabled={actionLoading}>
            <X className="h-4 w-4 mr-2" />
            Cancelar
          </Button>
        </div>
      )}

      {job.status === 'completed' && job.final_document_path && (
        <Card className="border-green-600/30 bg-green-500/5">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Pronto
            </CardTitle>
            <CardDescription>Todas as etapas foram concluídas.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="bg-green-600 hover:bg-green-700" onClick={() => handleDownload('final')}>
              <Download className="h-4 w-4 mr-2" />
              Baixar documento final
            </Button>
          </CardContent>
        </Card>
      )}

      {job.status === 'failed' && (
        <Card className="border-red-500/40 bg-red-500/5">
          <CardHeader>
            <CardTitle className="text-lg text-red-600">Algo deu errado</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {getAIErrorMessage(job.error_message || 'Tente iniciar de novo.')}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { className: string; label: string }> = {
    pending: { className: 'bg-muted text-muted-foreground', label: statusLabel('pending') },
    running: { className: 'bg-red-600 text-white', label: statusLabel('running') },
    paused: { className: 'bg-amber-500 text-white', label: statusLabel('paused') },
    awaiting_approval: { className: 'bg-amber-600 text-white', label: statusLabel('awaiting_approval') },
    applying_changes: { className: 'bg-violet-600 text-white', label: statusLabel('applying_changes') },
    completed: { className: 'bg-green-600 text-white', label: statusLabel('completed') },
    failed: { className: 'bg-red-700 text-white', label: statusLabel('failed') },
    cancelled: { className: 'bg-muted text-muted-foreground', label: statusLabel('cancelled') }
  };
  const c = config[status] || { className: 'bg-muted', label: status };

  return (
    <Badge className={`${c.className} px-3 py-1.5 text-sm font-medium shrink-0`}>{c.label}</Badge>
  );
}
