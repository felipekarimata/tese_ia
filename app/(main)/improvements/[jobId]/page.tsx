'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { ProcessingScreen } from '@/components/processing-screen';
import {
  Loader2,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  Sparkles,
  Info,
  Download
} from 'lucide-react';
import Link from 'next/link';
import { ImprovementSuggestion } from '@/lib/improvement/types';
import { getAIErrorMessage } from '@/lib/ai-error-message';
import { AIErrorBanner } from '@/components/ai-error-banner';

type ImprovementJob = {
  jobId: string;
  documentId: string;
  status: 'pending' | 'analyzing' | 'completed' | 'error';
  progress: {
    currentSection: number;
    totalSections: number;
    percentage: number;
  };
  globalContext: {
    title?: string;
    theme: string;
    objective?: string;
    chapters: string[];
  };
  suggestions: ImprovementSuggestion[];
  error?: string;
  createdAt: string;
  completedAt?: string;
};

const IMPROVEMENT_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  grammar: { label: 'Gramática', color: 'bg-red-500' },
  style: { label: 'Estilo', color: 'bg-blue-500' },
  clarity: { label: 'Clareza', color: 'bg-green-500' },
  coherence: { label: 'Coerência', color: 'bg-purple-500' },
  conciseness: { label: 'Concisão', color: 'bg-orange-500' }
};

export default function ImprovementPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const jobId = params.jobId as string;
  const pipelineId = searchParams.get('pipeline');

  const [job, setJob] = useState<ImprovementJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [acceptedSuggestions, setAcceptedSuggestions] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);

  const jobRef = useRef<ImprovementJob | null>(null);
  jobRef.current = job;

  const loadJob = useCallback(async () => {
    try {
      const res = await fetch(`/api/improve/${jobId}`, { cache: 'no-store' });
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

  const toggleSuggestion = (suggestionId: string) => {
    setAcceptedSuggestions(prev => {
      const next = new Set(prev);
      if (next.has(suggestionId)) {
        next.delete(suggestionId);
      } else {
        next.add(suggestionId);
      }
      return next;
    });
  };

  const acceptAll = () => {
    setAcceptedSuggestions(new Set(job?.suggestions.map(s => s.id) || []));
    toast.success(`${job?.suggestions.length || 0} sugestões aceitas`);
  };

  const rejectAll = () => {
    setAcceptedSuggestions(new Set());
    toast.success('Todas as sugestões rejeitadas');
  };

  const applyImprovements = async () => {
    if (acceptedSuggestions.size === 0) {
      toast.error('Selecione pelo menos uma sugestão');
      return;
    }

    if (!job) return;

    try {
      setApplying(true);

      // Pipeline mode - approve and continue
      if (pipelineId) {
        toast.loading('Aplicando melhorias e continuando pipeline...');

        const res = await fetch(`/api/pipeline/${pipelineId}/approve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            approvedItems: Array.from(acceptedSuggestions)
          })
        });

        if (!res.ok) {
          const error = await res.json();
          throw new Error(error.error || 'Falha ao aprovar melhorias');
        }

        toast.dismiss();
        toast.success('Melhorias aprovadas! Pipeline continuando...');

        // Redirect back to pipeline page
        router.push(`/pipeline/${pipelineId}`);
        return;
      }

      // Standalone mode - apply and download
      toast.loading(`Aplicando ${acceptedSuggestions.size} melhorias...`);

      const res = await fetch(`/api/improve/${jobId}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          acceptedSuggestionIds: Array.from(acceptedSuggestions)
        })
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Falha ao aplicar melhorias');
      }

      // Download do arquivo
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${job.globalContext.title || 'documento'}_melhorado.docx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.dismiss();
      toast.success('Melhorias aplicadas! Documento baixado.');

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

  // Still analyzing
  if (job.status === 'analyzing' || job.status === 'pending') {
    return (
      <ProcessingScreen
        backHref={`/documents/${job.documentId}`}
        backLabel="Voltar ao documento"
        title="Análise em curso"
        subtitle={job.globalContext?.title || undefined}
        percent={job.progress.percentage}
        statusLine="A analisar o documento em busca de melhorias…"
        detailLine={
          job.progress.totalSections > 0
            ? `Parte ${job.progress.currentSection} de ${job.progress.totalSections}`
            : undefined
        }
        icon={<Sparkles className="h-9 w-9 text-red-500 animate-pulse" />}
      />
    );
  }

  // Error
  if (job.status === 'error') {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href={`/documents/${job.documentId}`}>
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
              Erro ao Analisar Documento
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AIErrorBanner error={job.error || 'Erro desconhecido'} className="mb-3" />
            <Button className="mt-4" onClick={() => router.push(`/documents/${job.documentId}`)}>
              Voltar ao Documento
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Completed - show suggestions
  const suggestionsByChapter = job.suggestions.reduce((acc, sug) => {
    const chapter = sug.chapterTitle || 'Sem capítulo';
    if (!acc[chapter]) acc[chapter] = [];
    acc[chapter].push(sug);
    return acc;
  }, {} as Record<string, ImprovementSuggestion[]>);

  const acceptedCount = acceptedSuggestions.size;
  const totalCount = job.suggestions.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href={`/documents/${job.documentId}`}>
          <Button variant="outline" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-3xl font-bold">Sugestões de Melhoria</h1>
          <p className="text-muted-foreground mt-1">{job.globalContext?.title || 'Sem título'}</p>
        </div>
        <Button
          onClick={applyImprovements}
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

      {/* Summary Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Análise Concluída
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={acceptAll}>
                Aceitar Todas
              </Button>
              <Button variant="outline" size="sm" onClick={rejectAll}>
                Rejeitar Todas
              </Button>
            </div>
          </CardTitle>
          <CardDescription>
            {totalCount} {totalCount === 1 ? 'sugestão encontrada' : 'sugestões encontradas'} •{' '}
            {acceptedCount} {acceptedCount === 1 ? 'aceita' : 'aceitas'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {job.globalContext && (
            <div className="p-4 bg-muted rounded-lg space-y-2">
              <p className="text-sm font-medium">Tema do Documento:</p>
              <p className="text-sm text-muted-foreground">{job.globalContext.theme}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Suggestions by Chapter */}
      {totalCount === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Info className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-lg font-medium">Nenhuma melhoria sugerida</p>
            <p className="text-muted-foreground">
              O documento está bem escrito! Não foram encontradas oportunidades de melhoria.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(suggestionsByChapter).map(([chapter, suggestions]) => (
            <Card key={chapter}>
              <CardHeader>
                <CardTitle className="text-xl">{chapter}</CardTitle>
                <CardDescription>
                  {suggestions.length} {suggestions.length === 1 ? 'sugestão' : 'sugestões'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {suggestions.map((suggestion) => {
                  const isAccepted = acceptedSuggestions.has(suggestion.id);
                  const typeInfo = IMPROVEMENT_TYPE_LABELS[suggestion.type] || {
                    label: suggestion.type,
                    color: 'bg-gray-500'
                  };

                  return (
                    <div
                      key={suggestion.id}
                      className={`p-4 border rounded-lg transition-all ${
                        isAccepted ? 'border-green-500 bg-green-50' : 'border-gray-200'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <Badge className={typeInfo.color}>{typeInfo.label}</Badge>
                        <Badge variant="outline" className="ml-2">
                          Confiança: {Math.round(suggestion.confidence * 100)}%
                        </Badge>
                      </div>

                      <div className="space-y-3">
                        <div>
                          <p className="text-sm font-medium text-gray-500 mb-1">Original:</p>
                          <p className="text-sm text-gray-900 bg-red-50 p-2 rounded border border-red-200">
                            {suggestion.originalText}
                          </p>
                        </div>

                        <div>
                          <p className="text-sm font-medium text-gray-500 mb-1">Sugestão:</p>
                          <p className="text-sm text-gray-900 bg-green-50 p-2 rounded border border-green-200">
                            {suggestion.improvedText}
                          </p>
                        </div>

                        <div className="flex items-start gap-2">
                          <Info className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                          <p className="text-sm text-gray-600 italic">{suggestion.reason}</p>
                        </div>
                      </div>

                      <div className="flex gap-2 mt-4">
                        {isAccepted ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => toggleSuggestion(suggestion.id)}
                            className="border-red-500 text-red-600 hover:bg-red-50"
                          >
                            <XCircle className="mr-1 h-4 w-4" />
                            Rejeitar
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => toggleSuggestion(suggestion.id)}
                            className="border-green-500 text-green-600 hover:bg-green-50"
                          >
                            <CheckCircle2 className="mr-1 h-4 w-4" />
                            Aceitar
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
