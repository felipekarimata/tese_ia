'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, SearchCheck, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ProcessingScreen } from '@/components/processing-screen';
import { SuggestionReviewPanel, type Suggestion } from '@/components/suggestion-review-panel';
import { AIErrorBanner } from '@/components/ai-error-banner';

type UpdateJob = {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  progress: number;
  errorMessage?: string;
};

export default function ChapterUpdatePage() {
  const params = useParams();
  const router = useRouter();
  const chapterId = params.id as string;
  const jobId = params.jobId as string;
  const [job, setJob] = useState<UpdateJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [chapterTitle, setChapterTitle] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [fullText, setFullText] = useState('');
  const jobRef = useRef<UpdateJob | null>(null);
  jobRef.current = job;

  const loadSuggestions = useCallback(async () => {
    const response = await fetch(`/api/chapters/${chapterId}/operations/${jobId}/suggestions`);
    if (!response.ok) throw new Error('Falha ao carregar sugestões');
    const data = await response.json();
    setSuggestions(data.suggestions || []);
    setFullText(data.fullText || '');
  }, [chapterId, jobId]);

  const loadJob = useCallback(async () => {
    try {
      const response = await fetch(`/api/chapters/${chapterId}/operations/${jobId}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Revisão não encontrada');
      const data = await response.json();
      setJob(data.job);
      if (data.job.status === 'completed') await loadSuggestions();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [chapterId, jobId, loadSuggestions]);

  useEffect(() => {
    void loadJob();
    void fetch(`/api/chapters/${chapterId}`)
      .then(response => response.ok ? response.json() : null)
      .then(data => setChapterTitle(data?.chapter?.title || ''))
      .catch(() => undefined);
  }, [chapterId, loadJob]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (jobRef.current?.status === 'pending' || jobRef.current?.status === 'processing') void loadJob();
    }, 3000);
    return () => clearInterval(timer);
  }, [loadJob]);

  const handleApply = async (acceptedSuggestionIds: string[]) => {
    const toastId = toast.loading('Aplicando atualizações selecionadas...');
    try {
      const response = await fetch(`/api/chapters/${chapterId}/operations/${jobId}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acceptedSuggestionIds })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Falha ao aplicar atualizações');
      toast.success('Atualizações aplicadas numa nova versão.', { id: toastId });
      router.push(`/chapters/${chapterId}/versions/${data.newVersionId}`);
    } catch (error: any) {
      toast.error(error.message, { id: toastId });
      throw error;
    }
  };

  if (loading) return <div className="py-12 text-center"><Loader2 className="mx-auto h-8 w-8 animate-spin" /></div>;
  if (!job) return <div className="py-12 text-center">Revisão não encontrada.</div>;

  if (job.status === 'pending' || job.status === 'processing') {
    return (
      <ProcessingScreen
        backHref={`/chapters/${chapterId}`}
        backLabel="Voltar ao capítulo"
        title="Revisão de atualidade em curso"
        subtitle={chapterTitle || undefined}
        percent={job.progress}
        statusLine="A pesquisar a web e a validar fontes por secção…"
        icon={<SearchCheck className="h-9 w-9 animate-pulse text-cyan-500" />}
      />
    );
  }

  if (job.status === 'error') {
    return (
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-red-600"><XCircle className="h-5 w-5" />Erro na revisão</CardTitle></CardHeader>
        <CardContent>
          <AIErrorBanner error={job.errorMessage || 'Erro desconhecido'} />
          <Button className="mt-4" onClick={() => router.push(`/chapters/${chapterId}`)}>Voltar ao capítulo</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href={`/chapters/${chapterId}`}><Button variant="outline" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <div><h1 className="text-3xl font-bold">Atualizações com fontes</h1><p className="mt-1 text-muted-foreground">{chapterTitle}</p></div>
      </div>
      <SuggestionReviewPanel
        suggestions={suggestions}
        documentTitle={chapterTitle}
        fullDocumentText={fullText}
        onApply={handleApply}
        typeLabels={{ update: { label: 'Atualização factual', color: 'bg-cyan-500' } }}
      />
    </div>
  );
}
