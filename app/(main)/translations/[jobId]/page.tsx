'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ProcessingScreen } from '@/components/processing-screen';
import {
  Download,
  FileText,
  CheckCircle2,
  XCircle,
  Loader2,
  ArrowLeft,
  Eye,
  Search,
  X,
  Languages
} from 'lucide-react';
import '../document-viewer.css';

type TranslationJob = {
  jobId: string;
  documentId: string;
  progress: {
    status: string;
    currentChunk: number;
    totalChunks: number;
    percentage: number;
    currentSection?: string;
    error?: string;
    estimatedSecondsRemaining?: number;
    elapsedSeconds?: number;
    stats?: any;
  };
  outputPath?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
};

type Document = {
  id: string;
  title: string;
  pages: number;
  filePath: string;
  projectId?: string;
};

type DocumentText = {
  html?: string;
  text?: string;
  paragraphs?: string[];
  stats: {
    totalChars: number;
    totalWords: number;
    totalParagraphs?: number;
  };
};

export default function TranslationViewPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = params.jobId as string;

  const [job, setJob] = useState<TranslationJob | null>(null);
  const [document, setDocument] = useState<Document | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Texto dos documentos
  const [originalText, setOriginalText] = useState<DocumentText | null>(null);
  const [translatedText, setTranslatedText] = useState<DocumentText | null>(null);
  const [loadingTexts, setLoadingTexts] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<number>(0);
  const [currentResult, setCurrentResult] = useState<number>(0);

  // Refs para scroll sincronizado
  const originalScrollRef = useRef<HTMLDivElement>(null);
  const translatedScrollRef = useRef<HTMLDivElement>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const jobRef = useRef<TranslationJob | null>(null);
  jobRef.current = job;
  const documentRef = useRef<Document | null>(null);
  documentRef.current = document;

  const fetchJob = useCallback(async () => {
    try {
      const res = await fetch(`/api/translate/${jobId}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Não foi possível carregar o trabalho de tradução');

      const data = await res.json();
      setJob(data);

      if (!documentRef.current && data.documentId) {
        const docRes = await fetch(`/api/documents/${data.documentId}`);
        if (docRes.ok) {
          const docData = await docRes.json();
          setDocument(docData);
        }
      }

      setLoading(false);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    void fetchJob();
  }, [fetchJob]);

  useEffect(() => {
    const id = setInterval(() => {
      const j = jobRef.current;
      const st = j?.progress?.status;
      if (st === 'translating' || st === 'pending') {
        void fetchJob();
      }
    }, 2000);
    return () => clearInterval(id);
  }, [fetchJob]);

  // Carrega textos quando tradução completa
  const loadDocumentTexts = async () => {
    if (!document || !job?.outputPath) return;

    setLoadingTexts(true);
    try {
      // Carrega original como HTML
      const originalRes = await fetch(
        `/api/extract-text?bucket=documents&path=${encodeURIComponent(document.filePath)}&format=html`
      );
      if (originalRes.ok) {
        const originalData = await originalRes.json();
        setOriginalText(originalData);
      }

      // Carrega traduzido como HTML
      const translatedRes = await fetch(
        `/api/extract-text?bucket=translations&path=${encodeURIComponent(job.outputPath)}&format=html`
      );
      if (translatedRes.ok) {
        const translatedData = await translatedRes.json();
        setTranslatedText(translatedData);
      }
    } catch (err) {
      console.error('Failed to load document texts:', err);
    } finally {
      setLoadingTexts(false);
    }
  };

  // Search & highlight
  const highlightText = (html: string, query: string): string => {
    if (!query || query.length < 2) return html;

    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedQuery})`, 'gi');

    return html.replace(regex, '<mark class="bg-yellow-300 text-black">$1</mark>');
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    setCurrentResult(0);

    if (!query || query.length < 2) {
      setSearchResults(0);
      return;
    }

    // Count occurrences in both documents
    const combinedText = `${originalText?.text || ''} ${translatedText?.text || ''}`;
    const matches = combinedText.match(new RegExp(query, 'gi'));
    setSearchResults(matches?.length || 0);
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults(0);
    setCurrentResult(0);
  };

  // Scroll sincronizado
  const handleScroll = (source: 'original' | 'translated') => {
    if (isSyncing) return;
    setIsSyncing(true);

    const sourceRef = source === 'original' ? originalScrollRef : translatedScrollRef;
    const targetRef = source === 'original' ? translatedScrollRef : originalScrollRef;

    if (sourceRef.current && targetRef.current) {
      const scrollPercentage =
        sourceRef.current.scrollTop /
        (sourceRef.current.scrollHeight - sourceRef.current.clientHeight);

      targetRef.current.scrollTop =
        scrollPercentage * (targetRef.current.scrollHeight - targetRef.current.clientHeight);
    }

    setTimeout(() => setIsSyncing(false), 50);
  };

  const handleDownload = (bucket: string, path: string, fileName: string) => {
    const url = `/api/download?bucket=${bucket}&path=${encodeURIComponent(path)}`;
    const a = window.document.createElement('a');
    a.href = url;
    a.download = fileName;
    window.document.body.appendChild(a);
    a.click();
    window.document.body.removeChild(a);
  };

  if (loading) {
    return (
      <div className="container max-w-6xl mx-auto p-6 flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="container max-w-6xl mx-auto p-6">
        <Card className="p-6">
          <p className="text-red-500">
            Erro: {error || 'Trabalho de tradução não encontrado'}
          </p>
          <Button onClick={() => router.push('/')} className="mt-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar ao início
          </Button>
        </Card>
      </div>
    );
  }

  const isCompleted = job.progress.status === 'completed';
  const isError = job.progress.status === 'error';
  const isProcessing = job.progress.status === 'translating' || job.progress.status === 'pending';

  if (isProcessing) {
    const total = job.progress.totalChunks;
    const current = job.progress.currentChunk;
    return (
      <ProcessingScreen
        backHref="/"
        backLabel="Início"
        title="Tradução em curso"
        subtitle={document?.title}
        percent={job.progress.percentage}
        statusLine="A traduzir o documento…"
        detailLine={
          total > 0 ? `Parte ${current} de ${total} do texto` : undefined
        }
        icon={<Languages className="h-9 w-9 text-red-500 animate-pulse" />}
      />
    );
  }

  return (
    <div className="container max-w-7xl mx-auto p-6">
      <div className="mb-6">
        <Button onClick={() => router.push('/')} variant="ghost">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Voltar
        </Button>
      </div>

      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Estado da tradução</h1>
        {document && <p className="text-muted-foreground">Documento: {document.title}</p>}
      </div>

      <Tabs defaultValue="status" className="space-y-4">
        <TabsList>
          <TabsTrigger value="status">Estado e transferências</TabsTrigger>
          <TabsTrigger value="compare" disabled={!isCompleted}>
            <Eye className="w-4 h-4 mr-2" />
            Comparar documentos
          </TabsTrigger>
        </TabsList>

        {/* Tab: Status */}
        <TabsContent value="status" className="space-y-4">
          {/* Status Card */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Progresso</h2>
              {isCompleted && (
                <Badge className="bg-green-500">
                  <CheckCircle2 className="w-4 h-4 mr-1" />
                  Concluído
                </Badge>
              )}
              {isError && (
                <Badge variant="destructive">
                  <XCircle className="w-4 h-4 mr-1" />
                  Erro
                </Badge>
              )}
            </div>

            <div className="mb-4">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-muted-foreground">Progresso</span>
                <span className="tabular-nums font-medium">{job.progress.percentage}%</span>
              </div>
              <div className="w-full bg-white/10 rounded-full h-2.5 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    isCompleted ? 'bg-green-500' : isError ? 'bg-red-500' : 'bg-gradient-to-r from-red-600 to-red-700'
                  }`}
                  style={{ width: `${job.progress.percentage}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Partes do texto processadas</p>
                <p className="font-semibold">
                  {job.progress.currentChunk} / {job.progress.totalChunks}
                </p>
              </div>
              {job.progress.currentSection && (
                <div>
                  <p className="text-muted-foreground">Secção atual</p>
                  <p className="font-semibold">{job.progress.currentSection}</p>
                </div>
              )}
            </div>

            {job.progress.error && (
              <div className="mt-4 p-4 rounded-lg border border-red-500/30 bg-red-500/10 text-red-200">
                <p className="font-semibold">Erro</p>
                <p className="text-sm">{job.progress.error}</p>
              </div>
            )}
          </Card>

          {/* Download Section */}
          <div className="grid md:grid-cols-2 gap-4">
            {/* Original Document */}
            <Card className="p-6">
              <div className="flex items-center mb-4">
                <FileText className="w-5 h-5 mr-2 text-muted-foreground" />
                <h3 className="text-lg font-semibold">Documento original</h3>
              </div>
              {document && (
                <>
                  <p className="text-sm text-muted-foreground mb-4">
                    {document.title} ({document.pages} páginas)
                  </p>
                  <Button
                    onClick={() =>
                      handleDownload('documents', document.filePath, document.title)
                    }
                    className="w-full"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Transferir original
                  </Button>
                </>
              )}
            </Card>

            <Card className="p-6">
              <div className="flex items-center mb-4">
                <FileText className="w-5 h-5 mr-2 text-green-500" />
                <h3 className="text-lg font-semibold">Documento traduzido</h3>
              </div>
              {isCompleted && job.outputPath ? (
                <>
                  <p className="text-sm text-muted-foreground mb-4">
                    Tradução concluída com sucesso.
                  </p>
                  <Button
                    onClick={() =>
                      handleDownload(
                        'translations',
                        job.outputPath!,
                        job.outputPath!.split('/').pop() || 'translated.docx'
                      )
                    }
                    className="w-full bg-green-600 hover:bg-green-700"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Transferir tradução
                  </Button>
                </>
              ) : (
                <p className="text-sm text-muted-foreground mb-4">
                  Quando a tradução terminar, o botão de transferência aparecerá aqui.
                </p>
              )}
            </Card>
          </div>

          {/* Validation Stats */}
          {isCompleted && job.progress.stats && (
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">Relatório de validação</h3>
              <div className="grid md:grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Texto original</p>
                  <p className="font-semibold">
                    {job.progress.stats.originalWords} palavras
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {job.progress.stats.originalChars} caracteres
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Texto traduzido</p>
                  <p className="font-semibold">
                    {job.progress.stats.translatedWords} palavras
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {job.progress.stats.translatedChars} caracteres ({job.progress.stats.wordRatio})
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Qualidade</p>
                  <p className="font-semibold text-green-600">
                    ✓ {job.progress.stats.validationPassed} validações OK
                  </p>
                  {job.progress.stats.validationFailed > 0 && (
                    <p className="text-xs text-amber-600">
                      ⚠ {job.progress.stats.keptOriginal} trechos mantidos no original
                    </p>
                  )}
                </div>
              </div>
            </Card>
          )}
        </TabsContent>

        {/* Tab: Compare */}
        <TabsContent value="compare" className="space-y-4">
          {isCompleted && (
            <div>
              {/* Search Bar */}
              {originalText && translatedText && (
                <Card className="p-4 mb-4">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 flex items-center gap-2">
                      <Search className="w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Pesquisar nos documentos… (mín. 2 caracteres)"
                        value={searchQuery}
                        onChange={(e) => handleSearch(e.target.value)}
                        className="flex-1 px-3 py-2 border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-red-500/40"
                      />
                      {searchQuery && (
                        <Button
                          onClick={clearSearch}
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                    {searchResults > 0 && (
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">
                          {searchResults} {searchResults !== 1 ? 'resultados' : 'resultado'}
                        </span>
                      </div>
                    )}
                  </div>
                </Card>
              )}

              {!originalText && !translatedText ? (
                <Card className="p-6">
                  <Button onClick={loadDocumentTexts} disabled={loadingTexts} className="w-full">
                    {loadingTexts ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        A carregar documentos…
                      </>
                    ) : (
                      <>
                        <Eye className="w-4 h-4 mr-2" />
                        Carregar documentos para comparar
                      </>
                    )}
                  </Button>
                </Card>
              ) : (
                <div className="grid md:grid-cols-2 gap-4">
                  {/* Original */}
                  <Card className="p-4 bg-muted/30">
                    <h3 className="text-lg font-semibold mb-4 sticky top-0 bg-muted/30 pb-2 border-b border-red-500/60 text-foreground z-10">
                      Original
                    </h3>
                    <div
                      ref={originalScrollRef}
                      onScroll={() => handleScroll('original')}
                      className="max-h-[800px] overflow-y-auto pr-2"
                    >
                      <div
                        className="document-viewer"
                        dangerouslySetInnerHTML={{
                          __html: highlightText(originalText?.html || '', searchQuery)
                        }}
                      />
                    </div>
                  </Card>

                  {/* Translated */}
                  <Card className="p-4 bg-muted/30">
                    <h3 className="text-lg font-semibold mb-4 sticky top-0 bg-muted/30 pb-2 border-b border-red-500/60 text-foreground z-10">
                      Traduzido
                    </h3>
                    <div
                      ref={translatedScrollRef}
                      onScroll={() => handleScroll('translated')}
                      className="max-h-[800px] overflow-y-auto pr-2"
                    >
                      <div
                        className="document-viewer"
                        dangerouslySetInnerHTML={{
                          __html: highlightText(translatedText?.html || '', searchQuery)
                        }}
                      />
                    </div>
                  </Card>
                </div>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
