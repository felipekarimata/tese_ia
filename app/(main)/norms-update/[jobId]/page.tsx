'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { ProcessingScreen } from '@/components/processing-screen';
import {
  Loader2,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  AlertTriangle,
  ExternalLink,
  Download,
  RefreshCw,
  Info
} from 'lucide-react';
import Link from 'next/link';
import { NormReference } from '@/lib/norms-update/types';
import { getAIErrorMessage } from '@/lib/ai-error-message';
import { AIErrorBanner } from '@/components/ai-error-banner';

type ActivityLogEntry = {
  at: string;
  level?: 'info' | 'warn' | 'error';
  message: string;
};

type NormUpdateJob = {
  jobId: string;
  documentId: string | null;
  source?: 'document' | 'chapter';
  chapterId?: string;
  versionId?: string;
  status: 'pending' | 'analyzing' | 'completed' | 'error';
  progress: {
    currentReference: number;
    totalReferences: number;
    percentage: number;
  };
  activityLog?: ActivityLogEntry[];
  references: NormReference[];
  stats: {
    total: number;
    vigentes: number;
    alteradas: number;
    revogadas: number;
    substituidas: number;
    manualReview: number;
  };
  error?: string;
  createdAt: string;
  completedAt?: string;
};

const STATUS_INFO = {
  vigente: { label: 'Vigente', color: 'bg-green-500', icon: CheckCircle2 },
  alterada: { label: 'Alterada', color: 'bg-yellow-500', icon: AlertTriangle },
  revogada: { label: 'Revogada', color: 'bg-red-500', icon: XCircle },
  substituida: { label: 'Substituída', color: 'bg-orange-500', icon: RefreshCw },
  desconhecido: { label: 'Desconhecido', color: 'bg-gray-500', icon: Info }
};

function ActivityLogPanel({ entries }: { entries: ActivityLogEntry[] }) {
  if (!entries.length) return null;
  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-base">Atividade</CardTitle>
        <CardDescription>Etapa atual do processamento no servidor</CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-56 w-full rounded-md border bg-muted/30 p-3 text-sm font-mono">
          <ul className="space-y-2 pr-3">
            {entries.map((e, i) => (
              <li key={`${e.at}-${i}`} className="break-words">
                <span className="text-muted-foreground">
                  {new Date(e.at).toLocaleTimeString('pt-BR')}
                </span>{' '}
                <span
                  className={
                    e.level === 'error'
                      ? 'text-red-600'
                      : e.level === 'warn'
                        ? 'text-amber-600'
                        : ''
                  }
                >
                  {e.message}
                </span>
              </li>
            ))}
          </ul>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

const TYPE_LABELS: Record<string, string> = {
  lei: 'Lei',
  decreto: 'Decreto',
  portaria: 'Portaria',
  resolucao: 'Resolução',
  abnt: 'ABNT',
  iso: 'ISO',
  regulamento: 'Regulamento',
  outro: 'Outro'
};

export default function NormUpdatePage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const jobId = params.jobId as string;
  const pipelineId = searchParams.get('pipeline');

  const [job, setJob] = useState<NormUpdateJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [acceptedReferences, setAcceptedReferences] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);

  const jobRef = useRef<NormUpdateJob | null>(null);
  jobRef.current = job;

  const loadJob = useCallback(async () => {
    try {
      const res = await fetch(`/api/norms-update/${jobId}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Job not found');
      const data = await res.json();
      setJob(data);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    void loadJob();
  }, [loadJob]);

  useEffect(() => {
    const id = setInterval(() => {
      const j = jobRef.current;
      if (j?.status === 'analyzing' || j?.status === 'pending') {
        void loadJob();
      }
    }, 3000);
    return () => clearInterval(id);
  }, [loadJob]);

  const toggleReference = (refId: string) => {
    setAcceptedReferences(prev => {
      const next = new Set(prev);
      if (next.has(refId)) {
        next.delete(refId);
      } else {
        next.add(refId);
      }
      return next;
    });
  };

  const acceptAllAuto = () => {
    const autoRefs = job?.references.filter(r => r.updateType === 'auto').map(r => r.id) || [];
    setAcceptedReferences(new Set(autoRefs));
    toast.success(`${autoRefs.length} atualizações automáticas aceitas`);
  };

  const applyUpdates = async () => {
    if (acceptedReferences.size === 0) {
      toast.error('Selecione pelo menos uma atualização');
      return;
    }

    if (!job) return;

    try {
      setApplying(true);

      // Pipeline mode - approve and continue
      if (pipelineId) {
        toast.loading('Aplicando atualizações e continuando pipeline...');

        const res = await fetch(`/api/pipeline/${pipelineId}/approve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            approvedItems: Array.from(acceptedReferences)
          })
        });

        if (!res.ok) {
          const error = await res.json();
          throw new Error(error.error || 'Falha ao aprovar atualizações');
        }

        toast.dismiss();
        toast.success('Atualizações aprovadas! Pipeline continuando...');

        // Redirect back to pipeline page
        router.push(`/pipeline/${pipelineId}`);
        return;
      }

      // Standalone mode - apply and download
      toast.loading(`Aplicando ${acceptedReferences.size} atualizações...`);

      const res = await fetch(`/api/norms-update/${jobId}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          acceptedReferenceIds: Array.from(acceptedReferences)
        })
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Falha ao aplicar atualizações');
      }

      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await res.json();
        if (data.chapterId && data.newVersionId) {
          toast.dismiss();
          toast.success('Normas aplicadas! Nova versão do capítulo criada.');
          router.push(`/chapters/${data.chapterId}/versions/${data.newVersionId}`);
          return;
        }
      }

      // Download do arquivo (documento de projeto)
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `documento_normas_atualizadas.docx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.dismiss();
      toast.success('Atualizações aplicadas! Documento baixado.');

    } catch (error: any) {
      toast.dismiss();
      toast.error(error.message);
    } finally {
      setApplying(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
        <p className="text-muted-foreground mt-4">Carregando análise...</p>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Análise não encontrada</p>
        <Link href="/">
          <Button className="mt-4">Voltar</Button>
        </Link>
      </div>
    );
  }

  const isChapterJob = job.source === 'chapter' && job.chapterId && job.versionId;
  const backHref = isChapterJob
    ? `/chapters/${job.chapterId}/versions/${job.versionId}`
    : job.documentId
      ? `/documents/${job.documentId}`
      : '/';
  const backLabel = isChapterJob ? 'Voltar ao capítulo' : 'Voltar ao documento';

  // Still analyzing
  if (job.status === 'analyzing' || job.status === 'pending') {
    return (
      <ProcessingScreen
        backHref={backHref}
        backLabel={backLabel}
        title="Análise de normas em curso"
        subtitle="A verificar referências normativas"
        percent={job.progress.percentage}
        statusLine="A consultar bases e a cruzar referências…"
        detailLine={
          job.progress.totalReferences > 0
            ? `Referência ${job.progress.currentReference} de ${job.progress.totalReferences}`
            : undefined
        }
        icon={<RefreshCw className="h-9 w-9 text-red-500 animate-spin" />}
      >
        <ActivityLogPanel entries={job.activityLog ?? []} />
      </ProcessingScreen>
    );
  }

  // Error
  if (job.status === 'error') {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href={backHref}>
            <Button variant="outline" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-3xl font-bold">Erro na Análise</h1>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600">
              <XCircle className="h-5 w-5" />
              Erro ao Analisar {isChapterJob ? 'Capítulo' : 'Documento'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <AIErrorBanner error={job.error || 'Erro desconhecido'} className="mb-3" />
            <ActivityLogPanel entries={job.activityLog ?? []} />
            <Button className="mt-4" onClick={() => router.push(backHref)}>
              {backLabel}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Completed - show results
  const autoUpdates = job.references.filter(r => r.updateType === 'auto');
  const manualUpdates = job.references.filter(r => r.updateType === 'manual');
  const noUpdateNeeded = job.references.filter(r => r.updateType === 'none');

  const acceptedCount = acceptedReferences.size;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href={backHref}>
          <Button variant="outline" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-3xl font-bold">Atualização de Normas</h1>
          <p className="text-muted-foreground mt-1">{job.stats.total} referências encontradas</p>
        </div>
        <Button
          onClick={applyUpdates}
          disabled={acceptedCount === 0 || applying}
          size="lg"
          className={pipelineId ? 'bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800' : ''}
        >
          {applying ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {pipelineId ? 'Aprovando...' : 'Aplicando...'}
            </>
          ) : (
            <>
              {pipelineId ? (
                <>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Aprovar e Continuar Pipeline {acceptedCount > 0 ? `(${acceptedCount})` : ''}
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Aplicar {acceptedCount > 0 ? `(${acceptedCount})` : ''}
                </>
              )}
            </>
          )}
        </Button>
      </div>

      <ActivityLogPanel entries={job.activityLog ?? []} />

      {/* Summary Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Análise Concluída
            </span>
            {autoUpdates.length > 0 && (
              <Button variant="outline" size="sm" onClick={acceptAllAuto}>
                Aceitar Todas Automáticas
              </Button>
            )}
          </CardTitle>
          <CardDescription>
            {acceptedCount} {acceptedCount === 1 ? 'atualização aceita' : 'atualizações aceitas'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{job.stats.vigentes}</div>
              <div className="text-sm text-muted-foreground">Vigentes</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-600">{job.stats.alteradas}</div>
              <div className="text-sm text-muted-foreground">Alteradas</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">{job.stats.revogadas}</div>
              <div className="text-sm text-muted-foreground">Revogadas</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">{job.stats.substituidas}</div>
              <div className="text-sm text-muted-foreground">Substituídas</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">{job.stats.manualReview}</div>
              <div className="text-sm text-muted-foreground">Revisão Manual</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Auto Updates */}
      {autoUpdates.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Atualizações Automáticas ({autoUpdates.length})
            </CardTitle>
            <CardDescription>
              Estas normas podem ser atualizadas automaticamente
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {autoUpdates.map((ref) => (
              <ReferenceCard
                key={ref.id}
                reference={ref}
                isAccepted={acceptedReferences.has(ref.id)}
                onToggle={() => toggleReference(ref.id)}
              />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Manual Updates */}
      {manualUpdates.length > 0 && (
        <Card className="border-orange-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-600" />
              Requer Verificação Manual ({manualUpdates.length})
            </CardTitle>
            <CardDescription>
              Normas ABNT ou ISO e outros casos sem atualização automática — confira no original quando necessário
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {manualUpdates.map((ref) => (
              <ReferenceCard
                key={ref.id}
                reference={ref}
                isAccepted={false}
                onToggle={() => {}}
                isManual
              />
            ))}
          </CardContent>
        </Card>
      )}

      {/* No Update Needed */}
      {noUpdateNeeded.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Info className="h-5 w-5 text-blue-600" />
              Sem Atualização Necessária ({noUpdateNeeded.length})
            </CardTitle>
            <CardDescription>
              Estas normas estão vigentes e atualizadas
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {noUpdateNeeded.map((ref) => (
              <div key={ref.id} className="p-3 border rounded-lg flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Badge className="bg-green-500">{TYPE_LABELS[ref.type]}</Badge>
                  <span className="font-mono text-sm text-gray-900">{ref.fullText}</span>
                </div>
                <Badge variant="outline" className="text-green-600">
                  ✓ Vigente
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ReferenceCard({
  reference,
  isAccepted,
  onToggle,
  isManual = false
}: {
  reference: NormReference;
  isAccepted: boolean;
  onToggle: () => void;
  isManual?: boolean;
}) {
  const statusInfo = STATUS_INFO[reference.status || 'desconhecido'];
  const StatusIcon = statusInfo.icon;

  return (
    <div
      className={`p-4 border rounded-lg transition-all ${
        isAccepted ? 'border-green-500 bg-green-50' : 'border-gray-200'
      } ${isManual ? 'bg-orange-50' : ''}`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <Badge className={statusInfo.color}>
            <StatusIcon className="h-3 w-3 mr-1" />
            {statusInfo.label}
          </Badge>
          <Badge
            variant="outline"
            className={
              reference.type === 'abnt' || reference.type === 'iso'
                ? 'bg-orange-100 text-orange-700 border-orange-200'
                : ''
            }
          >
            {TYPE_LABELS[reference.type] ?? reference.type}
          </Badge>
        </div>
        {reference.confidence && (
          <Badge variant="outline">
            Confiança: {Math.round(reference.confidence * 100)}%
          </Badge>
        )}
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-sm font-medium text-gray-500 mb-1">Original:</p>
          <p className="text-sm text-gray-900 font-mono bg-gray-100 p-2 rounded">
            {reference.fullText}
          </p>
        </div>

        {reference.suggestedText && (
          <div>
            <p className="text-sm font-medium text-gray-500 mb-1">Atualização Sugerida:</p>
            <p className="text-sm text-gray-900 font-mono bg-green-100 p-2 rounded border border-green-200">
              {reference.suggestedText}
            </p>
          </div>
        )}

        {reference.updateDescription && (
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-gray-600">{reference.updateDescription}</p>
          </div>
        )}

        {reference.sourceUrl && (
          <a
            href={reference.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-600 hover:underline flex items-center gap-1"
          >
            Ver fonte oficial <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>

      {!isManual && reference.suggestedText && (
        <div className="flex gap-2 mt-4">
          {isAccepted ? (
            <Button
              variant="outline"
              size="sm"
              onClick={onToggle}
              className="border-red-500 text-red-600 hover:bg-red-50"
            >
              <XCircle className="mr-1 h-4 w-4" />
              Rejeitar
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={onToggle}
              className="border-green-500 text-green-600 hover:bg-green-50"
            >
              <CheckCircle2 className="mr-1 h-4 w-4" />
              Aceitar
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
