'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
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
  FileOutput,
  Link as LinkIcon,
  FileText
} from 'lucide-react';
import Link from 'next/link';
import { ImprovementSuggestion } from '@/lib/improvement/types';
import { OperationContextDisplay } from '@/components/thesis/operation-context-display';
import type { OperationContextSummary } from '@/lib/thesis/types';
import { AIErrorBanner } from '@/components/ai-error-banner';

type ImprovementJob = {
  id: string;
  chapterId: string;
  versionId: string;
  operation: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  progress: number;
  error?: string;
  newVersionId?: string;
  createdAt: string;
  completedAt?: string;
  metadata?: {
    contextChapters?: OperationContextSummary[];
    [key: string]: any;
  };
};

type OperationReference = {
  id: string;
  referenceType: 'link' | 'file';
  referenceContent: string;
  title: string;
  description?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  createdAt: string;
};

const IMPROVEMENT_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  grammar: { label: 'Gramática', color: 'bg-red-500' },
  style: { label: 'Estilo', color: 'bg-blue-500' },
  clarity: { label: 'Clareza', color: 'bg-green-500' },
  coherence: { label: 'Coerência', color: 'bg-purple-500' },
  conciseness: { label: 'Concisão', color: 'bg-orange-500' }
};

export default function ChapterImprovementPage() {
  const params = useParams();
  const router = useRouter();
  const chapterId = params.id as string;
  const jobId = params.jobId as string;

  const [job, setJob] = useState<ImprovementJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [chapterTitle, setChapterTitle] = useState<string>('');
  const [references, setReferences] = useState<OperationReference[]>([]);

  const jobRef = useRef<ImprovementJob | null>(null);
  jobRef.current = job;

  const loadChapterInfo = useCallback(async () => {
    try {
      const res = await fetch(`/api/chapters/${chapterId}`);
      if (res.ok) {
        const data = await res.json();
        setChapterTitle(data.chapter.title);
      }
    } catch (error) {
      console.error('Failed to load chapter:', error);
    }
  }, [chapterId]);

  const loadJob = useCallback(async () => {
    try {
      const res = await fetch(`/api/chapters/${chapterId}/operations/${jobId}`, {
        cache: 'no-store'
      });
      if (!res.ok) throw new Error('Job não encontrado');
      const data = await res.json();
      setJob(data.job);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [chapterId, jobId]);

  const loadReferences = useCallback(async () => {
    try {
      const res = await fetch(`/api/chapters/${chapterId}/operations/${jobId}/references`);
      if (res.ok) {
        const data = await res.json();
        setReferences(data.references || []);
        console.log('[IMPROVEMENT-PAGE] Loaded references:', data.references?.length || 0);
      }
    } catch (error) {
      console.error('[IMPROVEMENT-PAGE] Failed to load references:', error);
    }
  }, [chapterId, jobId]);

  useEffect(() => {
    void loadJob();
    void loadChapterInfo();
    void loadReferences();
  }, [loadJob, loadChapterInfo, loadReferences]);

  useEffect(() => {
    const id = setInterval(() => {
      const j = jobRef.current;
      if (j?.status === 'processing' || j?.status === 'pending') {
        void loadJob();
      }
    }, 3000);
    return () => clearInterval(id);
  }, [loadJob]);

  const viewNewVersion = () => {
    if (job?.newVersionId) {
      router.push(`/chapters/${chapterId}/versions/${job.newVersionId}`);
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
        <Link href={`/chapters/${chapterId}`}>
          <Button className="mt-4">Voltar</Button>
        </Link>
      </div>
    );
  }

  // Still processing
  if (job.status === 'processing' || job.status === 'pending') {
    return (
      <ProcessingScreen
        backHref={`/chapters/${chapterId}`}
        backLabel="Voltar ao capítulo"
        title="Melhorias em curso"
        subtitle={chapterTitle || undefined}
        percent={job.progress}
        statusLine="A analisar o capítulo em busca de melhorias…"
        icon={<Sparkles className="h-9 w-9 text-red-500 animate-pulse" />}
      />
    );
  }

  // Error
  if (job.status === 'error') {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href={`/chapters/${chapterId}`}>
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
              Erro ao Analisar Capítulo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AIErrorBanner error={job.error || 'Erro desconhecido'} className="mb-3" />
            <Button className="mt-4" onClick={() => router.push(`/chapters/${chapterId}`)}>
              Voltar ao Capítulo
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Completed
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href={`/chapters/${chapterId}`}>
          <Button variant="outline" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-3xl font-bold">Análise Concluída</h1>
          <p className="text-muted-foreground mt-1">{chapterTitle}</p>
        </div>
        {job.newVersionId && (
          <Button onClick={viewNewVersion} size="lg">
            <FileOutput className="mr-2 h-4 w-4" />
            Ver Nova Versão
          </Button>
        )}
      </div>

      {/* Success Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            Nova Versão Criada
          </CardTitle>
          <CardDescription>
            A análise foi concluída e uma nova versão do capítulo foi gerada com as melhorias aplicadas
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-sm font-medium text-green-900 mb-2">Operação Realizada:</p>
            <p className="text-sm text-green-700 capitalize">{job.operation}</p>
          </div>

          {job.completedAt && (
            <div className="text-sm text-muted-foreground">
              Concluído em: {new Date(job.completedAt).toLocaleString('pt-BR')}
            </div>
          )}

          <div className="flex gap-2 pt-4">
            <Button onClick={viewNewVersion} className="flex-1">
              <FileOutput className="mr-2 h-4 w-4" />
              Visualizar Nova Versão
            </Button>
            <Button variant="outline" onClick={() => router.push(`/chapters/${chapterId}`)}>
              Voltar ao Capítulo
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Context Chapters Display */}
      {job.metadata?.contextChapters && (
        <OperationContextDisplay contextChapters={job.metadata.contextChapters} />
      )}

      {/* References Card - Only show if references were used */}
      {references.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LinkIcon className="h-5 w-5 text-primary" />
              Materiais de Referência Utilizados
            </CardTitle>
            <CardDescription>
              {references.length} {references.length === 1 ? 'referência foi utilizada' : 'referências foram utilizadas'} nesta análise
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {references.map((ref) => (
                <div
                  key={ref.id}
                  className="p-3 bg-muted rounded-lg border border-muted-foreground/20"
                >
                  <div className="flex items-start gap-3">
                    {ref.referenceType === 'link' ? (
                      <LinkIcon className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                    ) : (
                      <FileText className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm">{ref.title}</span>
                        <Badge variant="outline" className="text-xs">
                          {ref.referenceType === 'link' ? 'Link' : 'Arquivo'}
                        </Badge>
                      </div>
                      {ref.description && (
                        <p className="text-sm text-muted-foreground mb-2">{ref.description}</p>
                      )}
                      {ref.referenceType === 'link' && (
                        <a
                          href={ref.referenceContent}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-500 hover:underline break-all"
                        >
                          {ref.referenceContent}
                        </a>
                      )}
                      {ref.referenceType === 'file' && ref.fileName && (
                        <p className="text-xs text-muted-foreground">
                          {ref.fileName}
                          {ref.fileSize && ` • ${(ref.fileSize / 1024).toFixed(1)} KB`}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Info Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5 text-blue-600" />
            Sobre o Versionamento
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>• Uma nova versão foi criada automaticamente com as melhorias aplicadas</p>
            <p>• A versão anterior permanece intacta e pode ser acessada no histórico</p>
            <p>• Você pode visualizar a árvore de versões na página do capítulo</p>
            <p>• Para comparar versões, acesse cada uma individualmente</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
