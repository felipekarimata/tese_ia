'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { AnswerCompareGrid } from '@/components/answer-compare-grid';
import { DocumentActionsCard } from '@/components/document-actions-card';
import { toast } from 'sonner';
import {
  FileText,
  Send,
  Loader2,
  Download,
  Languages,
  ArrowLeft,
  Sparkles,
  Gavel
} from 'lucide-react';
import Link from 'next/link';
import { getAIErrorMessage } from '@/lib/ai-error-message';

type Document = {
  id: string;
  title: string;
  pages: number;
  chunksCount: number;
};

type AIResponse = {
  provider: string;
  model: string;
  text: string;
  citations: Array<{ page: number; span: string }>;
  latencyMs: number;
  tokensIn: number;
  tokensOut: number;
  costEstimatedUsd: number;
};

export default function DocumentPage() {
  const params = useParams();
  const documentId = params.id as string;

  const [document, setDocument] = useState<Document | null>(null);
  const [loading, setLoading] = useState(true);
  const [question, setQuestion] = useState('');
  const [chatting, setChatting] = useState(false);
  const [answers, setAnswers] = useState<AIResponse[]>([]);
  const [translations, setTranslations] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [selectedProvider, setSelectedProvider] = useState<'openai' | 'gemini' | 'grok' | 'anthropic'>('openai');
  const [selectedModels, setSelectedModels] = useState({
    openai: '',
    gemini: '',
    grok: '',
    anthropic: ''
  });
  const [pipelineJobs, setPipelineJobs] = useState<any[]>([]);
  const [normJobs, setNormJobs] = useState<any[]>([]);

  const loadNormJobs = useCallback(async () => {
    try {
      const res = await fetch(`/api/documents/${documentId}/norm-jobs`);
      if (res.ok) {
        const data = await res.json();
        setNormJobs(data.jobs || []);
      }
    } catch (e) {
      console.error('Norm jobs load error:', e);
    }
  }, [documentId]);

  useEffect(() => {
    loadDocument();
    loadSettings();
    loadTranslations();
    loadPipelineJobs();
    loadNormJobs();
  }, [documentId, loadNormJobs]);

  const hasActiveNormJob = normJobs.some(
    (j) => j.status === 'analyzing' || j.status === 'pending'
  );
  useEffect(() => {
    if (!hasActiveNormJob) return;
    const id = setInterval(loadNormJobs, 4000);
    return () => clearInterval(id);
  }, [hasActiveNormJob, loadNormJobs]);

  const loadDocument = async () => {
    try {
      const res = await fetch(`/api/documents/${documentId}`);
      if (!res.ok) throw new Error('Documento não encontrado');
      const data = await res.json();
      setDocument(data);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const loadSettings = async () => {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      setSettings(data.settings);

      // Safely get first model for each provider with defensive checks
      const models = data.settings?.models || {};
      setSelectedModels({
        openai: models.openai?.[0] || '',
        gemini: models.gemini?.[0] || '',
        grok: models.grok?.[0] || '',
        anthropic: models.anthropic?.[0] || ''
      });
    } catch (error: any) {
      console.error('Settings load error:', error);
      toast.error('Erro ao carregar configurações');
    }
  };

  const loadTranslations = async () => {
    try {
      const res = await fetch(`/api/documents/${documentId}/translations`);
      if (res.ok) {
        const data = await res.json();
        setTranslations(data.translations || []);
      }
    } catch (error: any) {
      console.error('Translations load error:', error);
    }
  };

  const loadPipelineJobs = async () => {
    try {
      const res = await fetch(`/api/documents/${documentId}/pipelines`);
      if (res.ok) {
        const data = await res.json();
        setPipelineJobs(data.jobs || []);
      }
    } catch (error: any) {
      console.error('Pipeline jobs load error:', error);
    }
  };

  const handleChat = async () => {
    if (!question?.trim()) {
      toast.error('Digite uma pergunta');
      return;
    }

    if (!document) {
      toast.error('Documento não carregado');
      return;
    }

    setChatting(true);
    setAnswers([]);

    try {
      const providers = [selectedProvider];
      const model = selectedModels[selectedProvider];

      if (!model) {
        throw new Error(`Modelo não selecionado para ${selectedProvider}`);
      }

      const models: any = { [selectedProvider]: model };

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId,
          question,
          providers,
          models
        })
      });

      if (!res.ok) throw new Error('Falha na consulta');

      const data = await res.json();
      setAnswers(data.answers);
    } catch (error: any) {
      toast.error(getAIErrorMessage(error, 'Erro ao consultar IA'));
    } finally {
      setChatting(false);
    }
  };

  const handleExport = async (answer: AIResponse) => {
    try {
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId,
          answerText: answer.text,
          citations: answer.citations
        })
      });

      if (!res.ok) throw new Error('Falha ao exportar');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = window.document.createElement('a');
      a.href = url;
      a.download = `resposta-${answer.provider}-${documentId}.docx`;
      window.document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      window.document.body.removeChild(a);

      toast.success('Documento exportado!');
    } catch (error: any) {
      toast.error(error.message || 'Erro ao exportar');
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
        <p className="text-muted-foreground mt-4">Carregando documento...</p>
      </div>
    );
  }

  if (!document) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Documento não encontrado</p>
        <Link href="/">
          <Button className="mt-4">Voltar</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/">
          <Button variant="outline" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-3xl font-bold">{document.title}</h1>
          <div className="flex gap-2 mt-2">
            <Badge variant="secondary">{document.pages} páginas</Badge>
            <Badge variant="secondary">{document.chunksCount} chunks</Badge>
          </div>
        </div>
      </div>

      <DocumentActionsCard documentId={documentId} documentTitle={document.title} />

      {(translations.length > 0 || pipelineJobs.length > 0 || normJobs.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              Processamentos & Traduções
            </CardTitle>
            <CardDescription>
              Histórico de operações realizadas neste documento
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {/* Normas */}
              {normJobs.map((job) => (
                <Link
                  key={`norm-${job.id}`}
                  href={`/norms-update/${job.id}`}
                  className="block"
                >
                  <div className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <Gavel className="h-4 w-4 text-amber-600" />
                      <div>
                        <p className="font-medium">Atualização de normas</p>
                        <p className="text-sm text-gray-500">
                          {job.progress_percentage ?? 0}% ·{' '}
                          {new Date(job.created_at).toLocaleString('pt-BR')}
                        </p>
                      </div>
                    </div>
                    <Badge
                      className={
                        job.status === 'completed'
                          ? 'bg-green-500'
                          : job.status === 'error'
                            ? 'bg-red-500'
                            : job.status === 'analyzing'
                              ? 'bg-blue-500'
                              : 'bg-gray-500'
                      }
                    >
                      {job.status === 'completed'
                        ? 'Concluído'
                        : job.status === 'error'
                          ? 'Erro'
                          : job.status === 'analyzing'
                            ? 'Em andamento'
                            : 'Aguardando'}
                    </Badge>
                  </div>
                </Link>
              ))}

              {/* Pipeline Jobs */}
              {pipelineJobs.map((job) => (
                <Link
                  key={job.id}
                  href={`/pipeline/${job.id}`}
                  className="block"
                >
                  <div className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <Sparkles className="h-4 w-4 text-red-500" />
                      <div>
                        <p className="font-medium">
                          Pipeline: {job.selected_operations?.length || 0} operações
                        </p>
                        <p className="text-sm text-gray-500">
                          {new Date(job.created_at).toLocaleString('pt-BR')}
                        </p>
                      </div>
                    </div>
                    <Badge
                      className={
                        job.status === 'completed'
                          ? 'bg-green-500'
                          : job.status === 'failed'
                          ? 'bg-red-500'
                          : job.status === 'running'
                          ? 'bg-blue-500'
                          : 'bg-gray-500'
                      }
                    >
                      {job.status === 'completed'
                        ? 'Concluído'
                        : job.status === 'failed'
                        ? 'Erro'
                        : job.status === 'running'
                        ? 'Em andamento'
                        : job.status === 'awaiting_approval'
                        ? 'Aguardando aprovação'
                        : job.status}
                    </Badge>
                  </div>
                </Link>
              ))}

              {/* Translations */}
              {translations.map((translation) => (
                <Link
                  key={translation.id}
                  href={`/translations/${translation.id}`}
                  className="block"
                >
                  <div className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <Languages className="h-4 w-4 text-blue-500" />
                      <div>
                        <p className="font-medium">
                          Tradução: {translation.target_language?.toUpperCase() || 'N/A'}
                        </p>
                        <p className="text-sm text-gray-500">
                          {translation.model} · {new Date(translation.created_at).toLocaleString('pt-BR')}
                        </p>
                      </div>
                    </div>
                    <Badge
                      className={
                        translation.status === 'completed'
                          ? 'bg-green-500'
                          : translation.status === 'error'
                          ? 'bg-red-500'
                          : 'bg-blue-500'
                      }
                    >
                      {translation.status === 'completed'
                        ? 'Concluída'
                        : translation.status === 'error'
                        ? 'Erro'
                        : 'Em progresso'}
                    </Badge>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Chat sobre o Documento</CardTitle>
          <CardDescription>
            Faça perguntas sobre o conteúdo e receba respostas com citações
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="question">Pergunta</Label>
            <Textarea
              id="question"
              placeholder="Ex: Quais são os principais tópicos abordados?"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={3}
            />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Provedor</Label>
              <Select
                value={selectedProvider}
                onValueChange={(v) => setSelectedProvider(v as any)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="gemini">Gemini</SelectItem>
                  <SelectItem value="grok">Grok</SelectItem>
                  <SelectItem value="anthropic">Claude</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Modelo</Label>
              <Select
                value={selectedModels[selectedProvider]}
                onValueChange={(v) =>
                  setSelectedModels((prev) => ({ ...prev, [selectedProvider]: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {settings?.models[selectedProvider]?.map((model: string) => (
                    <SelectItem key={model} value={model}>
                      {model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button onClick={handleChat} disabled={chatting} className="w-full">
            {chatting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Consultando IA...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Enviar Pergunta
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {answers.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold">Respostas</h2>
            {answers.length === 1 && (
              <Button onClick={() => handleExport(answers[0])} variant="outline">
                <Download className="mr-2 h-4 w-4" />
                Exportar DOCX
              </Button>
            )}
          </div>
          <AnswerCompareGrid answers={answers} />
        </div>
      )}

    </div>
  );
}
