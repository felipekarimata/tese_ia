'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { ProcessingScreen } from '@/components/processing-screen';
import {
  Loader2,
  XCircle,
  ArrowLeft,
  Sliders
} from 'lucide-react';
import Link from 'next/link';
import { SuggestionReviewPanel, Suggestion } from '@/components/suggestion-review-panel';
import { AIErrorBanner } from '@/components/ai-error-banner';

type AdjustJob = {
  id: string;
  chapterId: string;
  versionId: string;
  operation: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  progress: number;
  errorMessage?: string;
  newVersionId?: string;
  createdAt: string;
  completedAt?: string;
};

export default function ChapterAdjustPage() {
  const params = useParams();
  const router = useRouter();
  const chapterId = params.id as string;
  const jobId = params.jobId as string;

  const [job, setJob] = useState<AdjustJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [chapterTitle, setChapterTitle] = useState<string>('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [fullText, setFullText] = useState<string>('');

  const jobRef = useRef<AdjustJob | null>(null);
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

  const loadSuggestionsAndText = useCallback(async () => {
    try {
      const res = await fetch(`/api/chapters/${chapterId}/operations/${jobId}/suggestions`);
      if (!res.ok) throw new Error('Falha ao carregar sugestões');
      const data = await res.json();

      setSuggestions(data.suggestions || []);
      setFullText(data.fullText || '');
    } catch (error: any) {
      toast.error(error.message);
    }
  }, [chapterId, jobId]);

  const loadJob = useCallback(async () => {
    try {
      const res = await fetch(`/api/chapters/${chapterId}/operations/${jobId}`, {
        cache: 'no-store'
      });
      if (!res.ok) throw new Error('Job não encontrado');
      const data = await res.json();
      setJob(data.job);

      if (data.job.status === 'completed') {
        await loadSuggestionsAndText();
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [chapterId, jobId, loadSuggestionsAndText]);

  useEffect(() => {
    void loadJob();
    void loadChapterInfo();
  }, [loadJob, loadChapterInfo]);

  useEffect(() => {
    const id = setInterval(() => {
      const j = jobRef.current;
      if (j?.status === 'processing' || j?.status === 'pending') {
        void loadJob();
      }
    }, 3000);
    return () => clearInterval(id);
  }, [loadJob]);

  const handleApply = async (acceptedIds: string[]) => {
    toast.loading('Aplicando ajustes selecionados...');

    try {
      const res = await fetch(`/api/chapters/${chapterId}/operations/${jobId}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acceptedSuggestionIds: acceptedIds })
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Falha ao aplicar ajustes');
      }

      const data = await res.json();

      toast.dismiss();
      toast.success('Ajustes aplicados! Nova versão criada.');

      // Redirect to new version
      router.push(`/chapters/${chapterId}/versions/${data.newVersionId}`);
    } catch (error: any) {
      toast.dismiss();
      toast.error(error.message);
      throw error;
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
        title="Ajuste em curso"
        subtitle={chapterTitle || undefined}
        percent={job.progress}
        statusLine="A analisar o texto e a gerar sugestões…"
        icon={<Sliders className="h-9 w-9 text-red-500 animate-pulse" />}
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
              Erro ao Analisar Documento
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AIErrorBanner error={job.errorMessage || 'Erro desconhecido'} className="mb-3" />
            <Button className="mt-4" onClick={() => router.push(`/chapters/${chapterId}`)}>
              Voltar ao Capítulo
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Completed - show suggestions
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href={`/chapters/${chapterId}`}>
          <Button variant="outline" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-3xl font-bold">Sugestões de Ajuste</h1>
          <p className="text-muted-foreground mt-1">{chapterTitle}</p>
        </div>
      </div>

      <SuggestionReviewPanel
        suggestions={suggestions}
        documentTitle={chapterTitle}
        fullDocumentText={fullText}
        onApply={handleApply}
        typeLabels={{
          adjustment: { label: 'Ajuste', color: 'bg-yellow-500' }
        }}
      />
    </div>
  );
}
