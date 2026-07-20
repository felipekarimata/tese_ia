'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  ArrowLeft, Send, FileText, PanelLeftClose, PanelLeftOpen, Sparkles,
  Loader2, Trash2, Languages, Wand2, Sliders, SearchCheck, ArrowLeftRight,
  CheckCircle2, AlertCircle, Bot, User as UserIcon, Download, BookOpen,
  ChevronDown, Cpu, Ban, History, PlayCircle, ChevronUp, X, Edit3, Save,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { VersionDiff } from '@/components/thesis/version-diff';
import { VersionHistory } from '@/components/thesis/version-history';
import { AIErrorBanner } from '@/components/ai-error-banner';
import { classifyAIError } from '@/lib/ai-error-message';
import { cancelJobRequest } from '@/components/jobs-status-button';

type ChapterVersion = {
  id: string;
  versionNumber: number;
  createdByOperation: string;
  createdAt: string;
  isCurrent: boolean;
  pages: number | null;
  parentVersionId: string | null;
};

type Chapter = {
  id: string;
  thesisId: string;
  title: string;
  chapterOrder: number;
  thesisTitle?: string;
  currentVersion: ChapterVersion | null;
  totalVersions: number;
};

type AIProvider = 'openai' | 'gemini' | 'grok' | 'anthropic';

const PROVIDER_LABEL: Record<AIProvider, string> = {
  openai: 'OpenAI',
  gemini: 'Google Gemini',
  grok: 'xAI Grok',
  anthropic: 'Anthropic Claude',
};

type Settings = {
  models?: Partial<Record<AIProvider, string[]>>;
};

type SiblingChapter = {
  id: string;
  title: string;
  chapterOrder: number;
};

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  command?: string;
  status?: 'pending' | 'running' | 'success' | 'error';
  jobId?: string;
  jobResultHref?: string;
  newVersionId?: string;
  errorMessage?: string;
  aiProvider?: AIProvider;
  aiModel?: string;
  pendingEditPrompt?: string;
};

type SlashCommand = {
  name: string;
  args: string;
  example: string;
  description: string;
  icon: React.ReactNode;
  color: string;
};

const COMMANDS: SlashCommand[] = [
  { name: '/perguntar', args: '<pergunta>',   example: '/perguntar qual o tema deste capítulo',  description: 'Pergunte algo sobre o documento — sem gerar versão',      icon: <Bot            className="h-4 w-4" />, color: 'text-cyan-400' },
  { name: '/traduzir',  args: '<idioma>',     example: '/traduzir inglês',                       description: 'Traduz a versão atual para outro idioma',                  icon: <Languages      className="h-4 w-4" />, color: 'text-purple-400' },
  { name: '/adaptar',   args: '<estilo>',     example: '/adaptar simplificado',                  description: 'Adapta o tom (acadêmico, profissional, simplificado)',     icon: <Wand2          className="h-4 w-4" />, color: 'text-pink-400' },
  { name: '/ajustar',   args: '<instruções>', example: '/ajustar expandir a conclusão',          description: 'Aplica uma edição: IA cria uma nova versão',               icon: <Sliders        className="h-4 w-4" />, color: 'text-orange-400' },
  { name: '/revisar',   args: '',             example: '/revisar',                               description: 'Verifica se leis citadas continuam vigentes',              icon: <SearchCheck    className="h-4 w-4" />, color: 'text-yellow-400' },
  { name: '/comparar',  args: '[v1] [v2]',    example: '/comparar 1 atual',                      description: 'Compara duas versões (padrão: original vs atual)',         icon: <ArrowLeftRight className="h-4 w-4" />, color: 'text-blue-400' },
  { name: '/todos',     args: '',             example: '/todos',                                 description: 'Executa em sequência: traduzir pt → adaptar simplificado → revisar leis', icon: <PlayCircle className="h-4 w-4" />, color: 'text-green-400' },
  { name: '/limpar',    args: '',             example: '/limpar',                                description: 'Limpa a conversa',                                         icon: <Trash2        className="h-4 w-4" />, color: 'text-gray-400' },
];

const LANGUAGE_MAP: Record<string, string> = {
  'português': 'pt', 'portugues': 'pt', 'pt': 'pt',
  'inglês': 'en', 'ingles': 'en', 'english': 'en', 'en': 'en',
  'espanhol': 'es', 'español': 'es', 'spanish': 'es', 'es': 'es',
  'francês': 'fr', 'frances': 'fr', 'french': 'fr', 'fr': 'fr',
  'alemão': 'de', 'alemao': 'de', 'german': 'de', 'de': 'de',
  'italiano': 'it', 'italian': 'it', 'it': 'it',
};

const STYLE_MAP: Record<string, string> = {
  'acadêmico': 'academic', 'academico': 'academic', 'academic': 'academic',
  'profissional': 'professional', 'professional': 'professional',
  'simplificado': 'simplified', 'simples': 'simplified', 'simplified': 'simplified',
};

export default function AgentModePage() {
  const params = useParams();
  const router = useRouter();
  const chapterId = params.id as string;

  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [versions, setVersions] = useState<ChapterVersion[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string>('');
  const [docText, setDocText] = useState<string>('');
  const [loadingDoc, setLoadingDoc] = useState(false);
  const [loadingChapter, setLoadingChapter] = useState(true);
  const [editingDoc, setEditingDoc] = useState(false);
  const [editText, setEditText] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const [showDoc, setShowDoc] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [showCommandHelp, setShowCommandHelp] = useState(false);

  const [settings, setSettings] = useState<Settings | null>(null);

  const [selectedProvider, setSelectedProvider] = useState<AIProvider>('gemini');
  const [selectedModel, setSelectedModel] = useState<string>('');

  const [siblings, setSiblings] = useState<SiblingChapter[]>([]);

  const [diffOpen, setDiffOpen] = useState(false);
  const [diffLeft, setDiffLeft] = useState<ChapterVersion | null>(null);
  const [diffRight, setDiffRight] = useState<ChapterVersion | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const storageKey = `agent-chat-${chapterId}`;

  // ─── Data loading ────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingChapter(true);
        const [chRes, vRes] = await Promise.all([
          fetch(`/api/chapters/${chapterId}`),
          fetch(`/api/chapters/${chapterId}/versions`),
        ]);
        if (!chRes.ok) throw new Error('Falha ao carregar capítulo');
        if (!vRes.ok) throw new Error('Falha ao carregar versões');
        const chData = await chRes.json();
        const vData = await vRes.json();
        if (cancelled) return;
        setChapter(chData.chapter);
        const list: ChapterVersion[] = (vData.versions || []).sort(
          (a: any, b: any) => a.versionNumber - b.versionNumber
        );
        setVersions(list);
        const current = list.find((v) => v.isCurrent) ?? list[list.length - 1];
        if (current) setSelectedVersionId(current.id);
      } catch (e: any) {
        toast.error(e.message || 'Erro ao carregar');
      } finally {
        if (!cancelled) setLoadingChapter(false);
      }
    })();
    return () => { cancelled = true; };
  }, [chapterId]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/settings');
        const data = await res.json();
        const s: Settings = data.settings || {};
        setSettings(s);
        const preference: AIProvider[] = ['gemini', 'anthropic', 'openai', 'grok'];
        for (const p of preference) {
          const models = s.models?.[p];
          if (models && models.length > 0) {
            setSelectedProvider(p);
            setSelectedModel(models[0]);
            return;
          }
        }
      } catch {}
    })();
  }, []);

  useEffect(() => {
    if (!chapter?.thesisId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/theses/${chapter.thesisId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const list: SiblingChapter[] = (data.chapters || [])
          .map((c: any) => ({ id: c.id, title: c.title, chapterOrder: c.chapterOrder }))
          .sort((a: SiblingChapter, b: SiblingChapter) => a.chapterOrder - b.chapterOrder);
        setSiblings(list);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [chapter?.thesisId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) setMessages(JSON.parse(stored));
    } catch {}
  }, [storageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(messages));
    } catch {}
  }, [messages, storageKey]);

  useEffect(() => {
    if (!selectedVersionId) return;
    let cancelled = false;
    (async () => {
      try {
        setLoadingDoc(true);
        const res = await fetch(`/api/chapters/${chapterId}/versions/${selectedVersionId}/text`);
        if (!res.ok) throw new Error('Falha ao carregar documento');
        const data = await res.json();
        if (!cancelled) {
          setDocText(data.text || '');
          setEditText(data.text || '');
          setEditingDoc(false);
        }
      } catch (e: any) {
        if (!cancelled) {
          setDocText('');
          setEditText('');
          setEditingDoc(false);
        }
        toast.error(e.message || 'Erro ao carregar documento');
      } finally {
        if (!cancelled) setLoadingDoc(false);
      }
    })();
    return () => { cancelled = true; };
  }, [chapterId, selectedVersionId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // ─── Derived state ───────────────────────────────────────────────────────────

  const currentVersion = versions.find((v) => v.id === selectedVersionId) ?? null;
  const originalVersion = versions[0] ?? null;

  const currentAI = selectedModel
    ? { provider: selectedProvider, model: selectedModel }
    : null;

  const availableProviders = useMemo<AIProvider[]>(() => {
    return (['openai', 'gemini', 'grok', 'anthropic'] as AIProvider[]).filter(
      (p) => (settings?.models?.[p]?.length ?? 0) > 0
    );
  }, [settings]);

  // ─── Helpers ────────────────────────────────────────────────────────────────

  const refreshVersions = async (): Promise<ChapterVersion[]> => {
    try {
      const d = await fetch(`/api/chapters/${chapterId}/versions`).then(r => r.json());
      const list: ChapterVersion[] = (d.versions || []).sort(
        (a: any, b: any) => a.versionNumber - b.versionNumber
      );
      setVersions(list);
      return list;
    } catch {
      return [];
    }
  };

  const handleDownload = async () => {
    if (!selectedVersionId) return;
    try {
      toast.info('Iniciando download...');
      const res = await fetch(`/api/chapters/${chapterId}/versions/${selectedVersionId}/download`);
      if (!res.ok) throw new Error('Falha ao baixar versão');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `capitulo_v${currentVersion?.versionNumber ?? ''}.docx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (e: any) {
      toast.error(e.message || 'Erro ao baixar');
    }
  };

  const handleDelete = async () => {
    if (!chapter) return;
    const confirmed = window.confirm(
      `Excluir permanentemente o capítulo "${chapter.title}"?\n\nTodas as versões serão removidas. Esta ação não pode ser desfeita.`
    );
    if (!confirmed) return;
    try {
      const res = await fetch(`/api/chapters/${chapterId}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Falha ao excluir');
      }
      toast.success('Capítulo excluído com sucesso.');
      router.push(chapter.thesisId ? `/theses/${chapter.thesisId}` : '/');
    } catch (e: any) {
      toast.error(e.message || 'Erro ao excluir capítulo');
    }
  };

  const appendMessage = (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => {
    const full: ChatMessage = { ...msg, id: crypto.randomUUID(), timestamp: Date.now() };
    setMessages((prev) => [...prev, full]);
    return full.id;
  };

  const updateMessage = (id: string, patch: Partial<ChatMessage>) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  };

  /**
   * Polls a chapter operation job until completion.
   * Returns the newVersionId if the operation created one, otherwise null.
   */
  const pollJob = async (
    jobId: string,
    asstId: string,
    opLabel: string,
    opts?: { silent?: boolean }
  ): Promise<string | null> => {
    const start = Date.now();
    const TIMEOUT_MS = 20 * 60 * 1000;

    while (Date.now() - start < TIMEOUT_MS) {
      await new Promise((r) => setTimeout(r, 2500));
      try {
        const res = await fetch(`/api/chapters/${chapterId}/operations/${jobId}`);
        if (!res.ok) continue;
        const data = await res.json();
        const job = data.job;

        if (job.status === 'completed' || job.status === 'success') {
          updateMessage(asstId, {
            status: 'success',
            content: `${opLabel} concluído. Revise aqui no agente e clique em "Aplicar como nova versão" para salvar.`,
            jobId,
            newVersionId: job.newVersionId,
          });

          // Refresh versions and auto-select the new one
          const freshList = await refreshVersions();
          if (job.newVersionId) {
            setSelectedVersionId(job.newVersionId);
          } else {
            const newest = freshList[freshList.length - 1];
            if (newest && newest.id !== selectedVersionId) setSelectedVersionId(newest.id);
          }

          if (!opts?.silent) {
            toast.success(`${opLabel} concluído!`, {
              description: 'Nova versão disponível no histórico.',
              duration: 5000,
            });
          }
          return job.newVersionId ?? null;
        }

        if (job.status === 'failed' || job.status === 'error') {
          const errMsg = job.errorMessage || job.error || 'Falha desconhecida';
          if (errMsg.includes('__CANCELLED_BY_USER__')) {
            updateMessage(asstId, {
              status: 'success',
              content: 'Operação cancelada. Nenhum crédito adicional foi gasto.',
            });
            return null;
          }
          const info = classifyAIError(errMsg);
          updateMessage(asstId, { status: 'error', content: errMsg });
          if (info.kind === 'quota') {
            toast.error(info.title, { description: info.message, duration: 10000 });
          } else if (info.kind === 'rate-limit') {
            toast.warning(info.title, { description: info.message, duration: 6000 });
          } else if (info.kind === 'auth') {
            toast.error(info.title, { description: info.message, duration: 10000 });
          }
          return null;
        }

        if (typeof job.progress === 'number') {
          const pct = job.progress > 1 ? Math.round(job.progress) : Math.round(job.progress * 100);
          updateMessage(asstId, { content: `${opLabel} em andamento... ${Math.min(100, pct)}%` });
        }
      } catch {}
    }

    updateMessage(asstId, {
      status: 'running',
      content: `${opLabel} ainda está em andamento no servidor. Acompanhe pelo botão Operações no topo ou pelo histórico de versões.`,
      jobId,
    });
    return null;
  };

  const runAdjustPipeline = async (instructions: string): Promise<string | null> => {
    if (!selectedVersionId) return null;
    const ai = currentAI;
    if (!ai) {
      appendMessage({ role: 'system', content: 'Selecione um provedor de IA no topo.', status: 'error' });
      return null;
    }

    const asstId = appendMessage({
      role: 'assistant',
      content: `Aplicando ajuste: "${instructions.slice(0, 80)}${instructions.length > 80 ? '...' : ''}"`,
      status: 'running',
      command: '/ajustar',
      aiProvider: ai.provider,
      aiModel: ai.model,
    });

    const res = await fetch(`/api/chapters/${chapterId}/adjust`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        versionId: selectedVersionId, instructions, creativity: 5,
        provider: ai.provider, model: ai.model, useGrounding: false,
        references: [], contextVersionIds: [],
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      updateMessage(asstId, { status: 'error', content: err.error || 'Falha ao iniciar ajuste' });
      return null;
    }
    const data = await res.json();
    updateMessage(asstId, { jobId: data.jobId });
    return pollJob(data.jobId, asstId, 'Ajuste');
  };

  /**
   * /todos — starts the server-side sequence that saves each step automatically.
   * The chat keeps polling so the user sees completion without leaving the agent.
   */
  const runTodosPipeline = async () => {
    if (!selectedVersionId) {
      appendMessage({ role: 'system', content: 'Selecione uma versão primeiro.', status: 'error' });
      return;
    }
    const ai = currentAI;
    if (!ai) {
      appendMessage({ role: 'system', content: 'Selecione um provedor de IA antes de usar /todos.', status: 'error' });
      return;
    }

    const startVersionCount = versions.length;
    const startedAt = new Date().toISOString();
    const asstId = appendMessage({
      role: 'assistant',
      content: '/todos iniciado: traduzir português → adaptar simplificado → revisar leis. Cada etapa salva uma nova versão e a próxima usa a versão mais recente.',
      status: 'running',
      command: '/todos',
      aiProvider: ai.provider,
      aiModel: ai.model,
    });

    try {
      const res = await fetch(`/api/chapters/${chapterId}/todos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetLanguage: 'pt',
          adaptStyle: 'simplified',
          provider: ai.provider,
          model: ai.model,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        updateMessage(asstId, { status: 'error', content: err.error || 'Falha ao iniciar /todos' });
        return;
      }
      await pollTodosPipeline(asstId, startedAt, startVersionCount);
    } catch (e: any) {
      updateMessage(asstId, { status: 'error', content: `/todos falhou: ${e.message}` });
    }
  };

  const handleSaveManualEdit = async () => {
    if (!selectedVersionId || !editText.trim()) return;
    try {
      setSavingEdit(true);
      const res = await fetch(`/api/chapters/${chapterId}/versions/${selectedVersionId}/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: editText }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Falha ao salvar edição');

      const fresh = await refreshVersions();
      const newVersionId = data.newVersionId || fresh[fresh.length - 1]?.id;
      if (newVersionId) setSelectedVersionId(newVersionId);
      setDocText(editText);
      setEditingDoc(false);
      setShowHistory(true);
      toast.success('Edição salva como nova versão.');
    } catch (e: any) {
      toast.error(e.message || 'Erro ao salvar edição');
    } finally {
      setSavingEdit(false);
    }
  };

  const pollTodosPipeline = async (asstId: string, startedAt: string, startVersionCount: number) => {
    const startMs = new Date(startedAt).getTime() - 5000;
    const timeoutMs = 45 * 60 * 1000;
    const started = Date.now();

    while (Date.now() - started < timeoutMs) {
      await new Promise((r) => setTimeout(r, 3000));

      const [jobsRes, versionsRes] = await Promise.all([
        fetch('/api/jobs/active').catch(() => null),
        fetch(`/api/chapters/${chapterId}/versions`).catch(() => null),
      ]);
      const jobsData = jobsRes?.ok ? await jobsRes.json().catch(() => ({})) : {};
      const versionsData = versionsRes?.ok ? await versionsRes.json().catch(() => ({})) : {};

      const chapterJobs = (jobsData.jobs || []).filter((job: any) =>
        job.type === 'chapter-operation' &&
        job.target?.id === chapterId &&
        new Date(job.createdAt).getTime() >= startMs
      );
      const running = chapterJobs.filter((job: any) => job.status === 'pending' || job.status === 'running');
      const failed = chapterJobs.find((job: any) => job.status === 'error');
      const completedOps = new Set(
        chapterJobs
          .filter((job: any) => job.status === 'completed')
          .map((job: any) => job.operation)
      );
      const freshVersions = (versionsData.versions || []).sort((a: any, b: any) => a.versionNumber - b.versionNumber);

      if (failed) {
        updateMessage(asstId, {
          status: 'error',
          content: `/todos falhou no passo ${failed.operation || ''}: ${failed.errorMessage || 'erro desconhecido'}`,
        });
        return;
      }

      const versionDelta = Math.max(0, freshVersions.length - startVersionCount);
      const label =
        completedOps.has('update') ? 'Passo 3/3 concluído: revisão de leis aplicada.' :
        completedOps.has('adapt') ? 'Passo 3/3 em andamento: revisando leis na versão simplificada.' :
        completedOps.has('translate') ? 'Passo 2/3 em andamento: adaptando a versão traduzida.' :
        'Passo 1/3 em andamento: traduzindo para português.';

      updateMessage(asstId, {
        status: 'running',
        content: `${label}\nVersões novas salvas até agora: ${versionDelta}.`,
      });

      const allDone =
        completedOps.has('translate') &&
        completedOps.has('adapt') &&
        completedOps.has('update') &&
        running.length === 0 &&
        versionDelta >= 3;
      if (allDone) {
        if (freshVersions.length > 0) {
          setVersions(freshVersions);
          setSelectedVersionId(freshVersions[freshVersions.length - 1].id);
        } else {
          await refreshVersions();
        }
        updateMessage(asstId, {
          status: 'success',
          content: `/todos concluído. Foram salvas ${versionDelta} nova(s) versão(ões), sempre usando a versão anterior mais recente como entrada.`,
        });
        toast.success('/todos concluído!', {
          description: 'Tradução, adaptação e revisão foram aplicadas automaticamente.',
          duration: 7000,
        });
        setShowHistory(true);
        return;
      }
    }

    updateMessage(asstId, {
      status: 'running',
      content: '/todos ainda está rodando no servidor. O chat continuará disponível; acompanhe também pelo botão Operações.',
    });
  };

  const runChat = async (userText: string) => {
    if (!docText) {
      appendMessage({ role: 'system', content: 'Aguarde o documento carregar antes de conversar.', status: 'error' });
      return;
    }
    const ai = currentAI;
    if (!ai) {
      appendMessage({ role: 'system', content: 'Selecione um provedor de IA no topo.', status: 'error' });
      return;
    }

    const asstId = appendMessage({
      role: 'assistant',
      content: 'Pensando...',
      status: 'running',
      aiProvider: ai.provider,
      aiModel: ai.model,
    });

    const history = messages
      .filter((m) => (m.role === 'user' || m.role === 'assistant') && (!m.command || m.command === '/perguntar'))
      .slice(-8)
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    try {
      const res = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: ai.provider,
          model: ai.model,
          documentTitle: chapter?.title,
          documentText: docText,
          history,
          userMessage: userText,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        updateMessage(asstId, { status: 'error', content: err.error || 'Falha ao conversar com a IA' });
        return;
      }
      const data = await res.json();
      if (data.kind === 'edit' && data.editPrompt) {
        updateMessage(asstId, {
          status: 'success',
          content: data.reply,
          pendingEditPrompt: data.editPrompt,
          command: '/perguntar',
        });
      } else {
        updateMessage(asstId, { status: 'success', content: data.reply, command: '/perguntar' });
      }
    } catch (e: any) {
      updateMessage(asstId, { status: 'error', content: e.message || 'Erro ao conversar' });
    }
  };

  const handleCommand = async (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;

    appendMessage({ role: 'user', content: trimmed });
    setInput('');

    if (!selectedVersionId || !currentVersion) {
      appendMessage({ role: 'system', content: 'Selecione uma versão primeiro.', status: 'error' });
      return;
    }

    const isSlash = trimmed.startsWith('/');
    let cmd = '';
    let args = '';
    if (isSlash) {
      const spaceIdx = trimmed.indexOf(' ');
      cmd = (spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx)).toLowerCase();
      args = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1).trim();
    } else {
      setSending(true);
      try { await runChat(trimmed); } finally { setSending(false); }
      return;
    }

    setSending(true);
    try {
      switch (cmd) {
        case '/limpar': {
          setMessages([]);
          return;
        }

        case '/perguntar': {
          if (!args) {
            appendMessage({ role: 'system', content: 'Use: /perguntar <sua pergunta>.', status: 'error' });
            return;
          }
          await runChat(args);
          return;
        }

        case '/comparar': {
          const parts = args.split(/\s+/).filter(Boolean);
          let leftV = originalVersion;
          let rightV = currentVersion;
          if (parts.length >= 1) {
            const first = parts[0].toLowerCase();
            if (first === 'atual') leftV = currentVersion;
            else if (first === 'original') leftV = originalVersion;
            else { const num = parseInt(first); const found = versions.find((v) => v.versionNumber === num); if (found) leftV = found; }
          }
          if (parts.length >= 2) {
            const second = parts[1].toLowerCase();
            if (second === 'atual') rightV = currentVersion;
            else if (second === 'original') rightV = originalVersion;
            else { const num = parseInt(second); const found = versions.find((v) => v.versionNumber === num); if (found) rightV = found; }
          }
          if (leftV && rightV) {
            setDiffLeft(leftV);
            setDiffRight(rightV);
            setDiffOpen(true);
            appendMessage({ role: 'assistant', content: `Abrindo comparação: v${leftV.versionNumber} ↔ v${rightV.versionNumber}`, status: 'success' });
          } else {
            appendMessage({ role: 'system', content: 'Não foi possível encontrar as versões.', status: 'error' });
          }
          return;
        }

        case '/traduzir': {
          if (!args) {
            appendMessage({ role: 'system', content: 'Use: /traduzir <idioma>. Ex: /traduzir inglês', status: 'error' });
            return;
          }
          const lang = LANGUAGE_MAP[args.toLowerCase().split(/\s+/)[0]];
          if (!lang) {
            appendMessage({ role: 'system', content: 'Idioma não reconhecido. Use: português, inglês, espanhol, francês, alemão ou italiano.', status: 'error' });
            return;
          }
          const ai = currentAI;
          if (!ai) { appendMessage({ role: 'system', content: 'Selecione um provedor de IA.', status: 'error' }); return; }
          const asstId = appendMessage({ role: 'assistant', content: `Iniciando tradução para ${args}...`, status: 'running', command: cmd, aiProvider: ai.provider, aiModel: ai.model });
          const res = await fetch(`/api/chapters/${chapterId}/translate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ versionId: selectedVersionId, targetLanguage: lang, provider: ai.provider, model: ai.model, references: [] }),
          });
          if (!res.ok) { const err = await res.json().catch(() => ({})); updateMessage(asstId, { status: 'error', content: `Erro: ${err.error || 'Falha ao iniciar tradução'}` }); return; }
          const { jobId } = await res.json();
          updateMessage(asstId, { jobId });
          await pollJob(jobId, asstId, 'Tradução');
          return;
        }

        case '/adaptar': {
          const styleKey = args.toLowerCase().split(/\s+/)[0];
          const style = STYLE_MAP[styleKey];
          if (!style) {
            appendMessage({ role: 'system', content: 'Use: /adaptar <estilo>. Estilos: acadêmico, profissional, simplificado.', status: 'error' });
            return;
          }
          const ai = currentAI;
          if (!ai) { appendMessage({ role: 'system', content: 'Selecione um provedor de IA.', status: 'error' }); return; }
          const asstId = appendMessage({ role: 'assistant', content: `Iniciando adaptação para estilo "${args}"...`, status: 'running', command: cmd, aiProvider: ai.provider, aiModel: ai.model });
          const res = await fetch(`/api/chapters/${chapterId}/adapt`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ versionId: selectedVersionId, style, provider: ai.provider, model: ai.model, references: [], contextVersionIds: [] }),
          });
          if (!res.ok) { const err = await res.json().catch(() => ({})); updateMessage(asstId, { status: 'error', content: `Erro: ${err.error || 'Falha ao iniciar adaptação'}` }); return; }
          const { jobId } = await res.json();
          updateMessage(asstId, { jobId });
          await pollJob(jobId, asstId, 'Adaptação');
          return;
        }

        case '/ajustar': {
          if (!args) {
            appendMessage({ role: 'system', content: 'Descreva o ajuste. Ex: /ajustar expandir a conclusão com mais exemplos.', status: 'error' });
            return;
          }
          await runAdjustPipeline(args);
          return;
        }

        case '/revisar': {
          const ai = currentAI;
          if (!ai) { appendMessage({ role: 'system', content: 'Selecione um provedor de IA.', status: 'error' }); return; }
          const asstId = appendMessage({ role: 'assistant', content: 'Verificando vigência das leis e normas citadas...', status: 'running', command: cmd, aiProvider: ai.provider, aiModel: ai.model });
          const res = await fetch(`/api/chapters/${chapterId}/versions/${selectedVersionId}/norms-update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider: ai.provider, model: ai.model }),
          });
          if (!res.ok) { const err = await res.json().catch(() => ({})); updateMessage(asstId, { status: 'error', content: `Erro: ${err.error || 'Falha ao iniciar revisão'}` }); return; }
          const { jobId } = await res.json();
          updateMessage(asstId, { status: 'success', jobId, content: `Revisão de normas iniciada. Acompanhe em /norms-update/${jobId}.` });
          return;
        }

        case '/todos': {
          await runTodosPipeline();
          return;
        }

        default: {
          appendMessage({
            role: 'system',
            content: `Comando desconhecido: ${cmd}. Disponíveis: ${COMMANDS.map(c => c.name).join(', ')}`,
            status: 'error',
          });
        }
      }
    } catch (e: any) {
      appendMessage({ role: 'system', content: `Erro inesperado: ${e.message}`, status: 'error' });
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!sending) handleCommand(input);
    }
  };

  const filteredCommands = useMemo(() => {
    if (!input.startsWith('/')) return [];
    const q = input.slice(1).toLowerCase();
    return COMMANDS.filter((c) => c.name.slice(1).startsWith(q));
  }, [input]);

  if (loadingChapter) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 text-red-500 animate-spin" />
      </div>
    );
  }

  if (!chapter) return null;

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] -mx-4 sm:-mx-6 md:-mx-8 -mt-6">
      {/* ── Top bar ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-white/10 bg-black/40 backdrop-blur-xl gap-3 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Button
            variant="ghost" size="sm"
            onClick={() => router.push('/')}
            className="text-gray-400 hover:text-white flex-shrink-0"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Dashboard
          </Button>
          <div className="h-5 w-px bg-white/10 flex-shrink-0" />
          <div className="flex items-center gap-2 min-w-0">
            <Bot className="h-4 w-4 text-red-400 flex-shrink-0" />
            <span className="text-sm font-semibold text-white truncate">Modo Agente</span>
            <Badge className="bg-red-500/15 text-red-400 border border-red-500/30 text-[10px] uppercase tracking-wider flex-shrink-0">Beta</Badge>
          </div>

          {siblings.length > 1 && (
            <>
              <div className="h-5 w-px bg-white/10 flex-shrink-0" />
              <Select value={chapterId} onValueChange={(v) => router.push(`/chapters/${v}/agent`)}>
                <SelectTrigger className="w-[200px] h-9 bg-white/5 border-white/10 text-sm">
                  <BookOpen className="h-3.5 w-3.5 mr-1.5 text-gray-400 flex-shrink-0" />
                  <SelectValue placeholder="Capítulo" />
                </SelectTrigger>
                <SelectContent>
                  {siblings.map((c) => (
                    <SelectItem key={c.id} value={c.id}>Cap {c.chapterOrder}: {c.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
          {siblings.length <= 1 && (
            <>
              <div className="h-5 w-px bg-white/10 mx-1 flex-shrink-0" />
              <p className="text-sm text-gray-400 truncate">{chapter.title}</p>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* AI selector */}
          {availableProviders.length > 0 ? (
            <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-lg pl-2 h-9">
              <Cpu className="h-3.5 w-3.5 text-red-400 flex-shrink-0" />
              <Select
                value={selectedProvider}
                onValueChange={(v) => {
                  const p = v as AIProvider;
                  setSelectedProvider(p);
                  setSelectedModel(settings?.models?.[p]?.[0] || '');
                }}
              >
                <SelectTrigger className="h-9 border-0 bg-transparent text-xs font-medium text-white px-1.5 focus:ring-0 gap-1 w-auto">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableProviders.map((p) => (
                    <SelectItem key={p} value={p}>{PROVIDER_LABEL[p]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedModel} onValueChange={setSelectedModel}>
                <SelectTrigger className="h-9 border-0 border-l border-white/10 bg-transparent text-xs text-gray-300 px-2 focus:ring-0 rounded-none w-auto max-w-[160px]">
                  <SelectValue placeholder="Modelo" />
                </SelectTrigger>
                <SelectContent>
                  {(settings?.models?.[selectedProvider] ?? []).map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <Link href="/settings">
              <Button variant="outline" size="sm" className="border-amber-500/40 text-amber-300 hover:bg-amber-500/10 gap-1.5 text-xs h-9">
                <Cpu className="h-3.5 w-3.5" />
                Configurar IA
              </Button>
            </Link>
          )}

          {/* Version selector */}
          <Select value={selectedVersionId} onValueChange={setSelectedVersionId}>
            <SelectTrigger className="w-[130px] h-9 bg-white/5 border-white/10 text-sm">
              <SelectValue placeholder="Versão" />
            </SelectTrigger>
            <SelectContent>
              {versions.map((v) => (
                <SelectItem key={v.id} value={v.id}>v{v.versionNumber} {v.isCurrent && '· atual'}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Download */}
          <Button variant="ghost" size="sm" onClick={handleDownload} className="text-gray-400 hover:text-white" title="Baixar versão">
            <Download className="h-4 w-4" />
          </Button>

          {/* History toggle */}
          <Button
            variant="ghost" size="sm"
            onClick={() => setShowHistory((s) => !s)}
            className={cn('gap-1.5 text-xs h-9', showHistory ? 'text-red-400 bg-red-500/10' : 'text-gray-400 hover:text-white')}
            title={showHistory ? 'Ocultar histórico' : 'Mostrar histórico de versões'}
          >
            <History className="h-4 w-4" />
            {versions.length > 0 && (
              <Badge className="bg-white/10 text-gray-300 text-[10px] px-1 h-4">{versions.length}</Badge>
            )}
          </Button>

          {/* Toggle document panel */}
          <Button variant="ghost" size="sm" onClick={() => setShowDoc((s) => !s)} className="text-gray-400 hover:text-white" title={showDoc ? 'Ocultar documento' : 'Mostrar documento'}>
            {showDoc ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
          </Button>

          {/* Delete chapter */}
          <Button
            variant="ghost" size="sm"
            onClick={handleDelete}
            className="text-gray-500 hover:text-red-400 hover:bg-red-500/10"
            title="Excluir capítulo"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        {/* Doc + Chat row */}
        <div className="flex flex-1 overflow-hidden min-h-0">
          {/* Document pane */}
          {showDoc && (
            <div className="w-1/2 border-r border-white/10 flex flex-col bg-gradient-to-br from-gray-950 to-black">
              <div className="px-4 py-2.5 border-b border-white/10 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <FileText className="h-3.5 w-3.5" />
                  <span>v{currentVersion?.versionNumber}</span>
                  {currentVersion?.isCurrent && (
                    <Badge className="bg-red-600 text-white text-[10px] px-1.5 py-0">Atual</Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-600">
                    {(editingDoc ? editText.length : docText.length).toLocaleString()} chars
                  </span>
                  {editingDoc ? (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditText(docText);
                          setEditingDoc(false);
                        }}
                        disabled={savingEdit}
                        className="h-8 text-xs text-gray-400 hover:text-white"
                      >
                        Cancelar
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleSaveManualEdit}
                        disabled={savingEdit || !editText.trim() || editText === docText}
                        className="h-8 gap-1.5 bg-red-600 hover:bg-red-700 text-xs"
                      >
                        {savingEdit ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                        Salvar versão
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditText(docText);
                        setEditingDoc(true);
                      }}
                      disabled={!docText || loadingDoc}
                      className="h-8 gap-1.5 text-xs text-gray-400 hover:text-white"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      Editar
                    </Button>
                  )}
                </div>
              </div>
              <ScrollArea className="flex-1">
                <div className="p-6">
                  {loadingDoc ? (
                    <div className="flex items-center justify-center py-20">
                      <Loader2 className="h-6 w-6 text-red-500 animate-spin" />
                    </div>
                  ) : editingDoc ? (
                    <textarea
                      value={editText}
                      onChange={(event) => setEditText(event.target.value)}
                      spellCheck
                      className="min-h-[calc(100vh-220px)] w-full resize-y rounded-lg border border-white/10 bg-black/30 p-4 font-sans text-sm leading-relaxed text-gray-100 outline-none transition focus:border-red-500/60 focus:ring-2 focus:ring-red-500/20"
                    />
                  ) : docText ? (
                    <pre className="whitespace-pre-wrap font-sans text-sm text-gray-300 leading-relaxed">{docText}</pre>
                  ) : (
                    <p className="text-gray-500 text-sm text-center py-8">Não foi possível carregar o documento.</p>
                  )}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* Chat pane */}
          <div className={cn('flex flex-col bg-gradient-to-br from-gray-950 to-gray-900 min-h-0', showDoc ? 'w-1/2' : 'w-full')}>
            <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0">
              <div className="max-w-3xl mx-auto px-6 py-6 space-y-5">
                {messages.length === 0 && (
                  <WelcomeBlock onPick={(cmd) => { setInput(cmd + ' '); inputRef.current?.focus(); }} />
                )}
                {messages.map((msg) => (
                  <MessageBubble
                    key={msg.id}
                    message={msg}
                    chapterId={chapterId}
                    versions={versions}
                    onViewVersion={(vId) => {
                      setSelectedVersionId(vId);
                      setShowDoc(true);
                    }}
                    onApplyPendingEdit={(prompt) => {
                      updateMessage(msg.id, { pendingEditPrompt: undefined });
                      setSending(true);
                      runAdjustPipeline(prompt).finally(() => setSending(false));
                    }}
                    onApplied={async () => {
                      const fresh = await refreshVersions();
                      const newest = fresh[fresh.length - 1];
                      if (newest) setSelectedVersionId(newest.id);
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Slash autocomplete */}
            {filteredCommands.length > 0 && (
              <div className="border-t border-white/10 bg-black/60 backdrop-blur flex-shrink-0">
                <div className="max-w-3xl mx-auto px-6 py-2 space-y-0.5">
                  {filteredCommands.map((c) => (
                    <button
                      key={c.name}
                      onClick={() => { setInput(c.name + ' '); inputRef.current?.focus(); }}
                      className="w-full flex items-center gap-3 px-2 py-1.5 rounded-md hover:bg-white/5 text-left text-sm"
                    >
                      <span className={cn('flex-shrink-0', c.color)}>{c.icon}</span>
                      <span className="font-mono text-white">{c.name}</span>
                      <span className="text-gray-500 text-xs">{c.args}</span>
                      <span className="text-gray-500 text-xs ml-auto truncate">{c.description}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Input */}
            <div className="border-t border-white/10 bg-black/40 backdrop-blur-xl px-6 py-4 flex-shrink-0">
              <div className="max-w-3xl mx-auto">
                <div className="relative flex items-end gap-2 bg-white/[0.04] border border-white/15 rounded-2xl px-3 py-2 focus-within:border-red-500/40 transition-colors">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Pergunte algo, ou use /ajustar, /traduzir, /adaptar, /todos..."
                    rows={1}
                    disabled={sending}
                    className="flex-1 bg-transparent text-white placeholder:text-gray-600 text-sm resize-none outline-none py-1.5 max-h-32"
                  />
                  <Button
                    size="sm"
                    onClick={() => handleCommand(input)}
                    disabled={sending || !input.trim()}
                    className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white h-8 w-8 p-0 rounded-lg flex-shrink-0"
                  >
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
                <div className="flex items-center justify-between mt-2 px-1">
                  <button
                    onClick={() => setShowCommandHelp((s) => !s)}
                    className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1.5"
                  >
                    <Sparkles className="h-3 w-3" />
                    Comandos disponíveis
                  </button>
                  <span className="text-xs text-gray-600">Enter para enviar · Shift+Enter nova linha</span>
                </div>
                {showCommandHelp && (
                  <div className="mt-3 p-3 bg-white/[0.03] border border-white/10 rounded-lg space-y-0.5">
                    {COMMANDS.map((c) => (
                      <button
                        key={c.name}
                        type="button"
                        onClick={() => {
                          setInput(c.name + ' ');
                          setShowCommandHelp(false);
                          inputRef.current?.focus();
                        }}
                        className="w-full flex items-center gap-2 text-xs px-2 py-1.5 rounded-md hover:bg-white/[0.06] hover:border-white/10 transition text-left"
                      >
                        <span className={cn('flex-shrink-0', c.color)}>{c.icon}</span>
                        <code className="text-white font-mono">{c.example}</code>
                        <span className="text-gray-500 ml-auto truncate">{c.description}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── History panel ───────────────────────────────────────────────────── */}
        {showHistory && (
          <div className="flex-shrink-0 border-t border-white/10 bg-black/30 backdrop-blur" style={{ maxHeight: '300px', overflowY: 'auto' }}>
            <div className="flex items-center justify-between px-6 py-2 border-b border-white/10 sticky top-0 bg-black/60 backdrop-blur z-10">
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <History className="h-3.5 w-3.5 text-red-400" />
                <span className="font-medium text-white">Histórico de Versões</span>
                <Badge className="bg-white/10 text-gray-400 text-[10px] px-1.5">{versions.length}</Badge>
              </div>
              <Button
                variant="ghost" size="sm"
                onClick={() => setShowHistory(false)}
                className="h-6 w-6 p-0 text-gray-500 hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="px-4 py-3">
              <VersionHistory
                versions={versions}
                chapterId={chapterId}
                showHeader={false}
                onVersionDeleted={async (deletedId) => {
                  const fresh = await refreshVersions();
                  if (selectedVersionId === deletedId) {
                    const newest = fresh[fresh.length - 1];
                    if (newest) setSelectedVersionId(newest.id);
                  }
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Diff dialog */}
      {diffLeft && diffRight && (
        <VersionDiff
          open={diffOpen}
          onOpenChange={setDiffOpen}
          chapterId={chapterId}
          leftVersionId={diffLeft.id}
          leftVersionNumber={diffLeft.versionNumber}
          leftLabel={diffLeft.createdByOperation === 'upload' ? 'Original' : diffLeft.createdByOperation}
          rightVersionId={diffRight.id}
          rightVersionNumber={diffRight.versionNumber}
          rightLabel={diffRight.isCurrent ? 'Atual' : diffRight.createdByOperation}
        />
      )}
    </div>
  );
}

// ─── WelcomeBlock ─────────────────────────────────────────────────────────────

function WelcomeBlock({ onPick }: { onPick: (cmd: string) => void }) {
  return (
    <div className="text-center py-8 space-y-5">
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-red-500/20 to-red-700/10 border border-red-500/20">
        <Bot className="h-7 w-7 text-red-400" />
      </div>
      <div>
        <h2 className="text-xl font-semibold text-white mb-1">Como posso ajudar com este capítulo?</h2>
        <p className="text-sm text-gray-400 max-w-md mx-auto leading-relaxed">
          Faça uma <strong className="text-cyan-400">pergunta</strong> ou use um <code className="text-red-400">/comando</code> para editar e gerar uma nova versão.
          Use <code className="text-green-400">/todos</code> para executar a sequência completa automaticamente.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 max-w-lg mx-auto">
        {COMMANDS.filter(c => c.name !== '/limpar').map((c) => (
          <button
            key={c.name}
            onClick={() => onPick(c.name)}
            className="flex items-start gap-3 p-3 rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/20 transition text-left"
          >
            <div className={cn('p-1.5 rounded-md bg-white/5 flex-shrink-0', c.color)}>{c.icon}</div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-white">{c.name}</p>
              <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">{c.description}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── MessageBubble ────────────────────────────────────────────────────────────

function MessageBubble({
  message, chapterId, versions, onApplied, onApplyPendingEdit, onViewVersion,
}: {
  message: ChatMessage;
  chapterId: string;
  versions?: ChapterVersion[];
  onApplied: () => void;
  onApplyPendingEdit?: (prompt: string) => void;
  onViewVersion?: (versionId: string) => void;
}) {
  const [applying, setApplying] = useState(false);

  const handleApply = async () => {
    if (!message.jobId) return;
    try {
      setApplying(true);
      const res = await fetch(`/api/chapters/${chapterId}/operations/${message.jobId}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acceptedSuggestionIds: [] }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Falha ao aplicar');
      }
      toast.success('Nova versão aplicada!');
      onApplied();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setApplying(false);
    }
  };

  if (message.role === 'system') {
    return (
      <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
        <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
        <span>{message.content}</span>
      </div>
    );
  }

  if (message.role === 'user') {
    return (
      <div className="flex items-start gap-3 justify-end">
        <div className="max-w-[80%] bg-red-500/15 border border-red-500/25 text-white rounded-2xl rounded-tr-sm px-4 py-2.5">
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        </div>
        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-red-500/20 border border-red-500/30 flex items-center justify-center">
          <UserIcon className="h-3.5 w-3.5 text-red-400" />
        </div>
      </div>
    );
  }

  const isErrorMsg = message.status === 'error';
  const errorInfo = isErrorMsg ? classifyAIError(message.content) : null;
  const isAIError = errorInfo && errorInfo.kind !== 'unknown';

  const providerLabel: Record<string, string> = {
    openai: 'OpenAI', gemini: 'Gemini', anthropic: 'Claude', grok: 'Grok',
  };

  return (
    <div className="flex items-start gap-3">
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-red-500/30 to-red-700/20 border border-red-500/30 flex items-center justify-center">
        <Bot className="h-3.5 w-3.5 text-red-400" />
      </div>
      <div className="max-w-[80%] bg-white/[0.04] border border-white/10 rounded-2xl rounded-tl-sm px-4 py-2.5 space-y-2">
        {message.aiProvider && (
          <div className="flex items-center gap-1.5 text-[10px] text-gray-500 -mb-1">
            <span className="inline-block w-1 h-1 rounded-full bg-red-500" />
            <span className="font-medium">{providerLabel[message.aiProvider] ?? message.aiProvider}</span>
            {message.aiModel && <span className="text-gray-600">· {message.aiModel}</span>}
          </div>
        )}
        {isAIError ? (
          <AIErrorBanner error={message.content} variant="full" />
        ) : (
          <p className="text-sm text-gray-200 whitespace-pre-wrap">{message.content}</p>
        )}

        {message.status === 'running' && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Loader2 className="h-3 w-3 animate-spin" />
              Processando...
              {message.command === '/todos' && message.jobResultHref && (
                <Link
                  href={message.jobResultHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 ml-1"
                >
                  Ver operação ↗
                </Link>
              )}
            </div>
            {message.command !== '/todos' && (
              <>
                <p className="text-[11px] text-gray-600 leading-relaxed">
                  Pode sair desta página — a operação continua no servidor.
                </p>
                {message.jobId && (
                  <button
                    onClick={async (e) => {
                      e.preventDefault();
                      if (!confirm('Cancelar esta operação?')) return;
                      await cancelJobRequest(message.jobId!, 'chapter-operation');
                    }}
                    className="inline-flex items-center gap-1 text-[11px] text-gray-500 hover:text-red-400 transition-colors"
                  >
                    <Ban className="h-3 w-3" />
                    Cancelar
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {message.status === 'success' && message.command === '/todos' && (message.newVersionId || message.jobResultHref) && (
          <div className="flex items-center gap-2 pt-1 flex-wrap">
            {message.newVersionId && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onViewVersion?.(message.newVersionId!)}
                className="h-7 text-xs border-white/15 text-gray-300 hover:bg-white/10 gap-1"
              >
                <FileText className="h-3 w-3" />
                {(() => {
                  const vNum = versions?.find(v => v.id === message.newVersionId)?.versionNumber;
                  return vNum ? `Ver versão v${vNum}` : 'Ver versão';
                })()}
              </Button>
            )}
            {message.jobResultHref && (
              <Link
                href={message.jobResultHref}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-gray-400 hover:text-white underline-offset-2 hover:underline"
              >
                Ver operação ↗
              </Link>
            )}
          </div>
        )}

        {message.status === 'success' && message.jobId && message.command && message.command !== '/comparar' && message.command !== '/revisar' && message.command !== '/todos' && (
          <div className="flex items-center gap-2 pt-1">
            <Button
              size="sm"
              onClick={handleApply}
              disabled={applying}
              className="h-7 text-xs bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800"
            >
              {applying ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Aplicando...</> : <><CheckCircle2 className="h-3 w-3 mr-1" />Aplicar como versão</>}
            </Button>
          </div>
        )}

        {message.pendingEditPrompt && onApplyPendingEdit && (
          <div className="pt-1 space-y-2 border-t border-white/10 mt-2">
            <p className="text-[11px] text-gray-500 uppercase tracking-wider font-semibold">Edição sugerida</p>
            <p className="text-xs text-gray-300 italic bg-white/[0.03] border border-white/10 rounded-md px-3 py-2">
              "{message.pendingEditPrompt}"
            </p>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => onApplyPendingEdit(message.pendingEditPrompt!)}
                className="h-7 text-xs bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800"
              >
                <Sliders className="h-3 w-3 mr-1" />
                Aplicar edição
              </Button>
              <span className="text-[11px] text-gray-500">cria uma nova versão</span>
            </div>
          </div>
        )}

        {message.status === 'error' && !isAIError && (
          <div className="flex items-center gap-1.5 text-xs text-red-400">
            <AlertCircle className="h-3 w-3" />
            Falhou
          </div>
        )}
      </div>
    </div>
  );
}
