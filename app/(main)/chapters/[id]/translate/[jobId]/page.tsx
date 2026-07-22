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
  Languages,
  Info,
  FileOutput,
  Link as LinkIcon,
  FileText
} from 'lucide-react';
import Link from 'next/link';
import { SuggestionReviewPanel, Suggestion } from '@/components/suggestion-review-panel';
import { AIErrorBanner } from '@/components/ai-error-banner';

type TranslateJob = {
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

export default function ChapterTranslatePage() {
  const params = useParams();
  const router = useRouter();
  const chapterId = params.id as string;
  const jobId = params.jobId as string;

  const [job, setJob] = useState<TranslateJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [chapterTitle, setChapterTitle] = useState<string>('');
  const [references, setReferences] = useState<OperationReference[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [fullText, setFullText] = useState<string>('');

  const jobRef = useRef<TranslateJob | null>(null);
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

  const loadReferences = useCallback(async () => {
    try {
      const res = await fetch(`/api/chapters/${chapterId}/operations/${jobId}/references`);
      if (res.ok) {
        const data = await res.json();
        setReferences(data.references || []);
        console.log('[TRANSLATE-PAGE] Loaded references:', data.references?.length || 0);
      }
    } catch (error) {
      console.error('[TRANSLATE-PAGE] Failed to load references:', error);
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

  const handleApply = async (acceptedIds: string[]) => {
    toast.loading('Aplicando traduções selecionadas...');

    try {
      const res = await fetch(`/api/chapters/${chapterId}/operations/${jobId}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acceptedSuggestionIds: acceptedIds })
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Falha ao aplicar traduções');
      }

      const data = await res.json();

      toast.dismiss();
      toast.success('Traduções aplicadas! Nova versão criada.');

      // Redirect to new version
      router.push(`/chapters/${chapterId}/versions/${data.newVersionId}`);
    } catch (error: any) {
      toast.dismiss();
      toast.error(error.message);
      throw error;
    }
  };

  const viewNewVersion = () => {
    if (job?.newVersionId) {
      router.push(`/chapters/${chapterId}/versions/${job.newVersionId}`);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
        <p className="text-muted-foreground mt-4">Carregando tradução...</p>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Tradução não encontrada</p>
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
        title="Tradução em curso"
        subtitle={chapterTitle || undefined}
        percent={job.progress}
        statusLine="A traduzir o seu capítulo…"
        icon={<Languages className="h-9 w-9 text-red-500 animate-pulse" />}
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
            <h1 className="text-3xl font-bold">Erro na Tradução</h1>
          </div>
        </div>

        <AIErrorBanner error={job.error || 'Erro desconhecido'} />

        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.push(`/chapters/${chapterId}`)}>
            Voltar ao Capítulo
          </Button>
          <Button onClick={() => router.push(`/chapters/${chapterId}/agent`)}>
            Tentar no Modo Agente
          </Button>
        </div>
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
          <h1 className="text-3xl font-bold">Sugestões de Tradução</h1>
          <p className="text-muted-foreground mt-1">{chapterTitle}</p>
        </div>
      </div>

      <SuggestionReviewPanel
        suggestions={suggestions}
        documentTitle={chapterTitle}
        fullDocumentText={fullText}
        onApply={handleApply}
        typeLabels={{
          translation: { label: 'Tradução', color: 'bg-green-500' }
        }}
      />
    </div>
  );
}
