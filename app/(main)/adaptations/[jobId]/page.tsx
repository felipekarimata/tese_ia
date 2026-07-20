'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { ProcessingScreen } from '@/components/processing-screen';
import { Loader2, XCircle, ArrowLeft, Wand2 } from 'lucide-react';
import Link from 'next/link';
import { SuggestionReviewPanel, type Suggestion } from '@/components/suggestion-review-panel';
import { getAIErrorMessage } from '@/lib/ai-error-message';
import { AIErrorBanner } from '@/components/ai-error-banner';

type AdaptJobApi = {
  jobId: string;
  documentId: string;
  status: 'pending' | 'adapting' | 'completed' | 'error';
  style?: string;
  targetAudience?: string;
  progress: {
    currentSection: number;
    totalSections: number;
    percentage: number;
  };
  suggestions: unknown[];
  error?: string;
};

function mapRawToSuggestion(raw: unknown): Suggestion | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  const id = typeof s.id === 'string' ? s.id : null;
  if (!id) return null;
  const originalText =
    (typeof s.originalText === 'string' && s.originalText) ||
    (typeof s.original_text === 'string' && s.original_text) ||
    '';
  const adapted =
    (typeof s.adaptedText === 'string' && s.adaptedText) ||
    (typeof s.adapted_text === 'string' && s.adapted_text) ||
    '';
  const type =
    (typeof s.adaptationType === 'string' && s.adaptationType) ||
    (typeof s.adaptation_type === 'string' && s.adaptation_type) ||
    'style';
  const reason = typeof s.reason === 'string' ? s.reason : '';
  const confidence = typeof s.confidence === 'number' ? s.confidence : 0.9;
  return {
    id,
    type,
    originalText,
    improvedText: adapted,
    reason,
    confidence
  };
}

export default function DocumentAdaptationPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const jobId = params.jobId as string;
  const pipelineId = searchParams.get('pipeline');

  const [job, setJob] = useState<AdaptJobApi | null>(null);
  const [loading, setLoading] = useState(true);
  const [documentTitle, setDocumentTitle] = useState('');
  const [fullText, setFullText] = useState('');

  const jobRef = useRef<AdaptJobApi | null>(null);
  jobRef.current = job;

  const loadJob = useCallback(async () => {
    try {
      const res = await fetch(`/api/adapt/${jobId}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Trabalho de adaptação não encontrado');
      const data = await res.json();
      setJob(data);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  const loadDocumentContext = useCallback(async (documentId: string) => {
    try {
      const docRes = await fetch(`/api/documents/${documentId}`);
      if (!docRes.ok) return;
      const doc = await docRes.json();
      setDocumentTitle(doc.title || 'Documento');
      const path = doc.filePath || doc.file_path;
      if (!path) return;
      const extRes = await fetch(
        `/api/extract-text?bucket=documents&path=${encodeURIComponent(path)}`
      );
      if (extRes.ok) {
        const ext = await extRes.json();
        setFullText(typeof ext.text === 'string' ? ext.text : '');
      }
    } catch {
      setFullText('');
    }
  }, []);

  useEffect(() => {
    void loadJob();
  }, [loadJob]);

  useEffect(() => {
    const id = setInterval(() => {
      const j = jobRef.current;
      if (j?.status === 'adapting' || j?.status === 'pending') {
        void loadJob();
      }
    }, 3000);
    return () => clearInterval(id);
  }, [loadJob]);

  useEffect(() => {
    if (!job?.documentId) return;
    void (async () => {
      const docRes = await fetch(`/api/documents/${job.documentId}`);
      if (docRes.ok) {
        const doc = await docRes.json();
        setDocumentTitle(doc.title || 'Documento');
      }
    })();
  }, [job?.documentId]);

  useEffect(() => {
    if (job?.documentId && job.status === 'completed') {
      void loadDocumentContext(job.documentId);
    }
  }, [job?.documentId, job?.status, loadDocumentContext]);

  const backHref = pipelineId ? `/pipeline/${pipelineId}` : job?.documentId ? `/documents/${job.documentId}` : '/';
  const backLabel = pipelineId ? 'Voltar ao pipeline' : 'Voltar ao documento';

  const handleApply = async (acceptedIds: string[]) => {
    if (!job) return;

    try {
      if (pipelineId) {
        toast.loading('A aplicar adaptações e a continuar o pipeline…');
        const res = await fetch(`/api/pipeline/${pipelineId}/approve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ approvedItems: acceptedIds })
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Falha ao aprovar adaptações');
        }
        toast.dismiss();
        toast.success('Adaptações aprovadas! Pipeline a continuar…');
        router.push(`/pipeline/${pipelineId}`);
        return;
      }

      toast.loading(`A aplicar ${acceptedIds.length} adaptação(ões)…`);
      const res = await fetch(`/api/adapt/${jobId}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acceptedSuggestionIds: acceptedIds })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Falha ao aplicar adaptações');
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = window.document.createElement('a');
      a.href = url;
      a.download = `${documentTitle || 'documento'}_adaptado.docx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.dismiss();
      toast.success('Adaptações aplicadas! Documento transferido.');
    } catch (error: any) {
      toast.dismiss();
      toast.error(getAIErrorMessage(error, error.message));
      throw error;
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
        <p className="text-muted-foreground mt-4">A carregar adaptação…</p>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Adaptação não encontrada</p>
        <Link href="/">
          <Button className="mt-4">Voltar</Button>
        </Link>
      </div>
    );
  }

  if (job.status === 'pending' || job.status === 'adapting') {
    const detail =
      job.progress.totalSections > 0
        ? `Secção ${job.progress.currentSection} de ${job.progress.totalSections}`
        : undefined;
    return (
      <ProcessingScreen
        backHref={backHref}
        backLabel={backLabel}
        title="Adaptação em curso"
        subtitle={documentTitle || undefined}
        percent={job.progress.percentage}
        statusLine="A adaptar o texto ao estilo pedido…"
        detailLine={detail}
        icon={<Wand2 className="h-9 w-9 text-red-500 animate-pulse" />}
      />
    );
  }

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
            <h1 className="text-3xl font-bold">Erro na adaptação</h1>
          </div>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600">
              <XCircle className="h-5 w-5" />
              Falha ao adaptar o documento
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AIErrorBanner error={job.error || 'Erro desconhecido'} className="mb-3" />
            <Button className="mt-4" onClick={() => router.push(backHref)}>
              {backLabel}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const suggestions: Suggestion[] = (job.suggestions || [])
    .map(mapRawToSuggestion)
    .filter((s): s is Suggestion => s !== null);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href={backHref}>
          <Button variant="outline" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-3xl font-bold">Sugestões de adaptação</h1>
          <p className="text-muted-foreground mt-1">{documentTitle || 'Documento'}</p>
        </div>
      </div>

      {suggestions.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Análise concluída</CardTitle>
            <CardDescription>Nenhuma sugestão de adaptação foi gerada.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => router.push(backHref)}>
              {backLabel}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <SuggestionReviewPanel
          suggestions={suggestions}
          documentTitle={documentTitle || 'Documento'}
          fullDocumentText={fullText}
          onApply={handleApply}
          typeLabels={{
            style: { label: 'Estilo', color: 'bg-purple-500' },
            tone: { label: 'Tom', color: 'bg-pink-500' },
            terminology: { label: 'Terminologia', color: 'bg-indigo-500' },
            structure: { label: 'Estrutura', color: 'bg-violet-500' },
            adaptation: { label: 'Adaptação', color: 'bg-purple-500' }
          }}
        />
      )}
    </div>
  );
}
