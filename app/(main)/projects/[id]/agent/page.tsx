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
  Loader2, Trash2, Languages, Wand2, Sliders, SearchCheck,
  CheckCircle2, AlertCircle, Bot, User as UserIcon, Download, Folder, Cpu, ExternalLink, Ban
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { AIErrorBanner } from '@/components/ai-error-banner';
import { classifyAIError } from '@/lib/ai-error-message';
import { cancelJobRequest } from '@/components/jobs-status-button';

type AIProvider = 'openai' | 'gemini' | 'grok' | 'anthropic';

const PROVIDER_LABEL: Record<AIProvider, string> = {
  openai: 'OpenAI',
  gemini: 'Google Gemini',
  grok: 'xAI Grok',
  anthropic: 'Anthropic Claude',
};

type Project = {
  id: string;
  name: string;
  description?: string;
};

type ProjectDocument = {
  id: string;
  title: string;
  pages: number | null;
  chunksCount: number | null;
};

type DocumentDetail = {
  id: string;
  title: string;
  filePath: string;
  pages: number | null;
};

type Settings = {
  models?: Partial<Record<AIProvider, string[]>>;
};

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  command?: string;
  status?: 'pending' | 'running' | 'success' | 'error';
  jobId?: string;
  resultHref?: string;
  /** AI used to produce this message — shown as proof. */
  aiProvider?: AIProvider;
  aiModel?: string;
  /** When AI detected an edit-intent from free text. */
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
  { name: '/perguntar', args: '<pergunta>',   example: '/perguntar do que se trata',      description: 'Pergunte algo sobre o documento — sem editar',  icon: <Bot         className="h-4 w-4" />, color: 'text-cyan-400' },
  { name: '/traduzir',  args: '<idioma>',     example: '/traduzir inglês',                description: 'Traduz o documento para outro idioma',          icon: <Languages   className="h-4 w-4" />, color: 'text-purple-400' },
  { name: '/adaptar',   args: '<estilo>',     example: '/adaptar simplificado',           description: 'Adapta o tom (academic, professional, simplified)', icon: <Wand2       className="h-4 w-4" />, color: 'text-pink-400' },
  { name: '/ajustar',   args: '<instruções>', example: '/ajustar expandir a conclusão',   description: 'Aplica uma edição: IA cria uma nova versão',     icon: <Sliders     className="h-4 w-4" />, color: 'text-orange-400' },
  { name: '/revisar',   args: '',             example: '/revisar',                        description: 'Verifica se leis citadas continuam vigentes',     icon: <SearchCheck className="h-4 w-4" />, color: 'text-yellow-400' },
  { name: '/todos',     args: '',             example: '/todos',                          description: 'Traduz para português, adapta e revisa normas em sequência', icon: <Sparkles className="h-4 w-4" />, color: 'text-red-400' },
  { name: '/limpar',    args: '',             example: '/limpar',                         description: 'Limpa a conversa',                                  icon: <Trash2      className="h-4 w-4" />, color: 'text-gray-400' },
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

export default function ProjectAgentPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string>('');
  const [docDetail, setDocDetail] = useState<DocumentDetail | null>(null);
  const [docText, setDocText] = useState('');
  const [loadingDoc, setLoadingDoc] = useState(false);
  const [loadingProject, setLoadingProject] = useState(true);

  const [showDoc, setShowDoc] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [showCommandHelp, setShowCommandHelp] = useState(false);

  const [settings, setSettings] = useState<Settings | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<AIProvider>('gemini');
  const [selectedModel, setSelectedModel] = useState<string>('');

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const storageKey = `agent-chat-project-${projectId}`;

  // Load project + documents
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingProject(true);
        const res = await fetch(`/api/projects/${projectId}`);
        if (!res.ok) {
          if (res.status === 404) {
            toast.error('Projeto não encontrado');
            router.push('/');
            return;
          }
          throw new Error('Falha ao carregar projeto');
        }
        const data = await res.json();
        if (cancelled) return;
        setProject(data.project);
        setDocuments(data.documents || []);
        if ((data.documents || []).length > 0) {
          setSelectedDocId(data.documents[0].id);
        }
      } catch (e: any) {
        toast.error(e.message || 'Erro ao carregar');
      } finally {
        if (!cancelled) setLoadingProject(false);
      }
    })();
    return () => { cancelled = true; };
  }, [projectId, router]);

  // Load settings + initialize AI
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

  // Load chat
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) setMessages(JSON.parse(stored));
    } catch {}
  }, [storageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try { localStorage.setItem(storageKey, JSON.stringify(messages)); } catch {}
  }, [messages, storageKey]);

  // Load document detail + text when selected doc changes
  useEffect(() => {
    if (!selectedDocId) return;
    let cancelled = false;
    (async () => {
      try {
        setLoadingDoc(true);
        const detailRes = await fetch(`/api/documents/${selectedDocId}`);
        if (!detailRes.ok) throw new Error('Falha ao carregar documento');
        const detail = await detailRes.json();
        if (cancelled) return;
        setDocDetail(detail);

        if (detail.filePath) {
          const textRes = await fetch(`/api/extract-text?bucket=documents&path=${encodeURIComponent(detail.filePath)}`);
          if (!textRes.ok) throw new Error('Falha ao extrair texto');
          const textData = await textRes.json();
          if (!cancelled) setDocText(textData.text || '');
        } else {
          setDocText('');
        }
      } catch (e: any) {
        if (!cancelled) setDocText('');
        toast.error(e.message || 'Erro ao carregar documento');
      } finally {
        if (!cancelled) setLoadingDoc(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedDocId]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const currentAI = selectedModel ? { provider: selectedProvider, model: selectedModel } : null;

  const availableProviders = useMemo<AIProvider[]>(() => {
    return (['openai', 'gemini', 'grok', 'anthropic'] as AIProvider[]).filter(
      (p) => (settings?.models?.[p]?.length ?? 0) > 0
    );
  }, [settings]);

  const appendMessage = (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => {
    const full: ChatMessage = { ...msg, id: crypto.randomUUID(), timestamp: Date.now() };
    setMessages((prev) => [...prev, full]);
    return full.id;
  };

  const updateMessage = (id: string, patch: Partial<ChatMessage>) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  };

  const handleDownload = async () => {
    if (!docDetail?.filePath) return;
    try {
      toast.info('Iniciando download...');
      const dlRes = await fetch(`/api/download?bucket=documents&path=${encodeURIComponent(docDetail.filePath)}`);
      if (!dlRes.ok) throw new Error('Falha ao baixar');
      const blob = await dlRes.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = docDetail.title || 'documento.docx';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (e: any) {
      toast.error(e.message || 'Erro ao baixar');
    }
  };

  const runAdjustPipeline = async (instructions: string) => {
    if (!selectedDocId) return;
    if (!currentAI) { appendMessage({ role: 'system', content: 'Selecione um provedor de IA no topo.', status: 'error' }); return; }

    const asstId = appendMessage({
      role: 'assistant', command: '/ajustar', status: 'running',
      content: `Aplicando ajuste: "${instructions.slice(0, 80)}${instructions.length > 80 ? '...' : ''}"`,
      aiProvider: currentAI.provider, aiModel: currentAI.model,
    });

    const res = await fetch(`/api/adjust`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        documentId: selectedDocId, instructions, creativity: 5,
        provider: currentAI.provider, model: currentAI.model, useGrounding: false,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      updateMessage(asstId, { status: 'error', content: err.error || 'Falha ao iniciar ajuste' });
      return;
    }
    const data = await res.json();
    updateMessage(asstId, {
      status: 'success',
      content: 'Ajuste iniciado. Acompanhe na página de resultado.',
      jobId: data.jobId,
      resultHref: `/adjustments/${data.jobId}`,
    });
  };

  const runChat = async (userText: string) => {
    if (!docText) {
      appendMessage({ role: 'system', content: 'Aguarde o documento carregar antes de conversar.', status: 'error' });
      return;
    }
    if (!currentAI) { appendMessage({ role: 'system', content: 'Selecione um provedor de IA no topo.', status: 'error' }); return; }

    const asstId = appendMessage({
      role: 'assistant', content: 'Pensando...', status: 'running',
      aiProvider: currentAI.provider, aiModel: currentAI.model,
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
          provider: currentAI.provider,
          model: currentAI.model,
          documentTitle: docDetail?.title,
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
        updateMessage(asstId, { status: 'success', content: data.reply, pendingEditPrompt: data.editPrompt, command: '/perguntar' });
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

    if (!selectedDocId) {
      appendMessage({ role: 'system', content: 'Selecione um documento primeiro.', status: 'error' });
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
      // Free text -> chat with edit-intent detection
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

        case '/traduzir': {
          if (!args) {
            appendMessage({ role: 'system', content: 'Use: /traduzir <idioma>. Ex: /traduzir inglês', status: 'error' });
            return;
          }
          const lang = LANGUAGE_MAP[args.toLowerCase().split(/\s+/)[0]];
          if (!lang) {
            appendMessage({ role: 'system', content: 'Idioma não reconhecido.', status: 'error' });
            return;
          }
          if (!currentAI) { appendMessage({ role: 'system', content: 'Selecione um provedor de IA no topo.', status: 'error' }); return; }

          const asstId = appendMessage({
            role: 'assistant', command: cmd, status: 'running',
            content: `Iniciando tradução para ${args}...`,
            aiProvider: currentAI.provider, aiModel: currentAI.model,
          });

          const res = await fetch(`/api/translate/${selectedDocId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetLanguage: lang, provider: currentAI.provider, model: currentAI.model }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            updateMessage(asstId, { status: 'error', content: err.error || 'Falha ao iniciar tradução' });
            return;
          }
          const data = await res.json();
          updateMessage(asstId, {
            status: 'success',
            content: `Tradução para ${args} iniciada. O acompanhamento, revisão e aplicação ficam na página de resultado.`,
            jobId: data.jobId,
            resultHref: `/translations/${data.jobId}`,
          });
          return;
        }

        case '/adaptar': {
          const styleKey = args.toLowerCase().split(/\s+/)[0];
          const style = STYLE_MAP[styleKey];
          if (!style) {
            appendMessage({ role: 'system', content: 'Use: /adaptar <estilo>. Estilos: acadêmico, profissional, simplificado.', status: 'error' });
            return;
          }
          if (!currentAI) { appendMessage({ role: 'system', content: 'Selecione um provedor de IA no topo.', status: 'error' }); return; }

          const asstId = appendMessage({
            role: 'assistant', command: cmd, status: 'running',
            content: `Iniciando adaptação para estilo "${args}"...`,
            aiProvider: currentAI.provider, aiModel: currentAI.model,
          });

          const res = await fetch(`/api/adapt`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ documentId: selectedDocId, style, provider: currentAI.provider, model: currentAI.model }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            updateMessage(asstId, { status: 'error', content: err.error || 'Falha ao iniciar adaptação' });
            return;
          }
          const data = await res.json();
          updateMessage(asstId, {
            status: 'success',
            content: `Adaptação iniciada. Acompanhe na página de resultado.`,
            jobId: data.jobId,
            resultHref: `/adaptations/${data.jobId}`,
          });
          return;
        }

        case '/ajustar': {
          if (!args) {
            appendMessage({ role: 'system', content: 'Descreva o ajuste desejado.', status: 'error' });
            return;
          }
          await runAdjustPipeline(args);
          return;
        }

        case '/revisar': {
          if (!currentAI) { appendMessage({ role: 'system', content: 'Selecione um provedor de IA no topo.', status: 'error' }); return; }

          const asstId = appendMessage({
            role: 'assistant', command: cmd, status: 'running',
            content: 'Verificando vigência das leis e normas citadas...',
            aiProvider: currentAI.provider, aiModel: currentAI.model,
          });

          const res = await fetch(`/api/norms-update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ documentId: selectedDocId, provider: currentAI.provider, model: currentAI.model }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            updateMessage(asstId, { status: 'error', content: err.error || 'Falha ao iniciar revisão' });
            return;
          }
          const data = await res.json();
          updateMessage(asstId, {
            status: 'success',
            content: 'Revisão de normas iniciada.',
            jobId: data.jobId,
            resultHref: `/norms-update/${data.jobId}`,
          });
          return;
        }

        case '/todos': {
          if (!currentAI) { appendMessage({ role: 'system', content: 'Selecione um provedor de IA no topo.', status: 'error' }); return; }

          const asstId = appendMessage({
            role: 'assistant',
            command: cmd,
            status: 'running',
            content: '/todos iniciado: traduzir português → adaptar simplificado → revisar leis. Cada etapa salva uma nova versão e a próxima usa o documento atualizado.',
            aiProvider: currentAI.provider,
            aiModel: currentAI.model,
          });

          const res = await fetch(`/api/documents/${selectedDocId}/todos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              provider: currentAI.provider,
              model: currentAI.model,
              targetLanguage: 'pt',
              adaptStyle: 'simplified',
            }),
          });

          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            updateMessage(asstId, { status: 'error', content: err.error || 'Falha ao iniciar /todos' });
            return;
          }

          updateMessage(asstId, {
            status: 'success',
            content: '/todos está rodando em sequência no servidor. Acompanhe as etapas em Operações; o documento do projeto será atualizado a cada versão salva.',
          });
          return;
        }

        default:
          appendMessage({
            role: 'system',
            content: `Comando desconhecido: ${cmd}. Comandos: ${COMMANDS.map(c => c.name).join(', ')}`,
            status: 'error',
          });
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

  if (loadingProject) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 text-red-500 animate-spin" />
      </div>
    );
  }

  if (!project) return null;

  // Empty state: no documents
  if (documents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center max-w-md mx-auto">
        <div className="p-5 bg-red-500/10 border border-red-500/20 rounded-2xl mb-6">
          <Folder className="h-12 w-12 text-red-400" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">{project.name}</h2>
        <p className="text-gray-400 mb-8">
          Este projeto ainda não tem documentos. Adicione um documento para começar a trabalhar no Modo Agente.
        </p>
        <Button
          onClick={() => router.push(`/projects/${projectId}`)}
          className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white"
        >
          Adicionar Documento
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] -mx-4 sm:-mx-6 md:-mx-8 -mt-6">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-white/10 bg-black/40 backdrop-blur-xl gap-3">
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

          {/* Document switcher */}
          {documents.length > 1 && (
            <>
              <div className="h-5 w-px bg-white/10 flex-shrink-0" />
              <Select value={selectedDocId} onValueChange={setSelectedDocId}>
                <SelectTrigger className="w-[220px] h-9 bg-white/5 border-white/10 text-sm">
                  <FileText className="h-3.5 w-3.5 mr-1.5 text-gray-400 flex-shrink-0" />
                  <SelectValue placeholder="Documento" />
                </SelectTrigger>
                <SelectContent>
                  {documents.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
          {documents.length <= 1 && (
            <>
              <div className="h-5 w-px bg-white/10 mx-1 flex-shrink-0" />
              <p className="text-sm text-gray-400 truncate">{project.name}</p>
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
                  const first = settings?.models?.[p]?.[0] || '';
                  setSelectedModel(first);
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

          <Button variant="ghost" size="sm" onClick={handleDownload} className="text-gray-400 hover:text-white" title="Baixar documento">
            <Download className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost" size="sm"
            onClick={() => setShowDoc((s) => !s)}
            className="text-gray-400 hover:text-white"
            title={showDoc ? 'Ocultar documento' : 'Mostrar documento'}
          >
            {showDoc ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
          </Button>

        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Document pane */}
        {showDoc && (
          <div className="w-1/2 border-r border-white/10 flex flex-col bg-gradient-to-br from-gray-950 to-black">
            <div className="px-4 py-2.5 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-gray-500 min-w-0">
                <FileText className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate">{docDetail?.title || 'Documento'}</span>
              </div>
              <span className="text-xs text-gray-600">{docText.length.toLocaleString()} caracteres</span>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-6">
                {loadingDoc ? (
                  <div className="flex items-center justify-center py-20">
                    <Loader2 className="h-6 w-6 text-red-500 animate-spin" />
                  </div>
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
        <div className={cn('flex flex-col bg-gradient-to-br from-gray-950 to-gray-900', showDoc ? 'w-1/2' : 'w-full')}>
          <div ref={scrollRef} className="flex-1 overflow-y-auto">
            <div className="max-w-3xl mx-auto px-6 py-6 space-y-5">
              {messages.length === 0 && (
                <WelcomeBlock onPick={(cmd) => { setInput(cmd + ' '); inputRef.current?.focus(); }} />
              )}
              {messages.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  onApplyPendingEdit={(prompt) => {
                    updateMessage(msg.id, { pendingEditPrompt: undefined });
                    setSending(true);
                    runAdjustPipeline(prompt).finally(() => setSending(false));
                  }}
                />
              ))}
            </div>
          </div>

          {filteredCommands.length > 0 && (
            <div className="border-t border-white/10 bg-black/60 backdrop-blur">
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

          <div className="border-t border-white/10 bg-black/40 backdrop-blur-xl px-6 py-4">
            <div className="max-w-3xl mx-auto">
              <div className="relative flex items-end gap-2 bg-white/[0.04] border border-white/15 rounded-2xl px-3 py-2 focus-within:border-red-500/40 transition-colors">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Pergunte algo sobre o documento, ou use /todos, /ajustar, /traduzir..."
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
                <span className="text-xs text-gray-600">Enter para enviar · Shift+Enter para quebra de linha</span>
              </div>
              {showCommandHelp && (
                <div className="mt-3 p-3 bg-white/[0.03] border border-white/10 rounded-lg space-y-1.5">
                  {COMMANDS.map((c) => (
                    <div key={c.name} className="flex items-center gap-2 text-xs">
                      <span className={cn('flex-shrink-0', c.color)}>{c.icon}</span>
                      <code className="text-white font-mono">{c.example}</code>
                      <span className="text-gray-500 ml-auto">{c.description}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function WelcomeBlock({ onPick }: { onPick: (cmd: string) => void }) {
  return (
    <div className="text-center py-8 space-y-5">
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-red-500/20 to-red-700/10 border border-red-500/20">
        <Bot className="h-7 w-7 text-red-400" />
      </div>
      <div>
        <h2 className="text-xl font-semibold text-white mb-1">Como posso ajudar com este documento?</h2>
        <p className="text-sm text-gray-400 max-w-md mx-auto leading-relaxed">
          Faça uma <strong className="text-cyan-400">pergunta</strong> sobre o documento (eu respondo aqui sem mexer no texto)
          ou use um <code className="text-red-400">/comando</code> para <strong className="text-red-400">editar</strong> e gerar uma nova versão.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 max-w-lg mx-auto">
        {COMMANDS.filter((c) => c.name !== '/limpar').slice(0, 5).map((c) => (
          <button
            key={c.name}
            onClick={() => onPick(c.name)}
            className="flex items-start gap-3 p-3 rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/20 transition text-left"
          >
            <div className={cn('p-1.5 rounded-md bg-white/5', c.color)}>{c.icon}</div>
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

function MessageBubble({
  message, onApplyPendingEdit,
}: {
  message: ChatMessage;
  onApplyPendingEdit?: (prompt: string) => void;
}) {
  const isErrorMsg = message.status === 'error';
  const errorInfo = isErrorMsg ? classifyAIError(message.content) : null;
  const isAIError = errorInfo && errorInfo.kind !== 'unknown';

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
            </div>
            <p className="text-[11px] text-gray-600 leading-relaxed">
              Pode sair desta página — a operação continua no servidor. Veja o status em <strong className="text-gray-500">Operações</strong> no topo.
            </p>
            {message.jobId && message.command && (
              <button
                onClick={async (e) => {
                  e.preventDefault();
                  if (!confirm('Cancelar esta operação? A IA para na próxima chamada — você economiza créditos a partir daí.')) return;
                  // Map command -> type for the cancel endpoint
                  const typeMap: Record<string, 'translate' | 'adjust' | 'adapt' | 'norms-update'> = {
                    '/traduzir': 'translate',
                    '/adaptar': 'adapt',
                    '/ajustar': 'adjust',
                    '/revisar': 'norms-update',
                  };
                  const type = typeMap[message.command!];
                  if (type) await cancelJobRequest(message.jobId!, type);
                }}
                className="inline-flex items-center gap-1 text-[11px] text-gray-500 hover:text-red-400 transition-colors"
              >
                <Ban className="h-3 w-3" />
                Cancelar
              </button>
            )}
          </div>
        )}

        {message.status === 'success' && message.resultHref && (
          <div className="pt-1">
            <Link
              href={message.resultHref}
              className="inline-flex items-center gap-1.5 text-xs font-medium bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white px-3 py-1.5 rounded-md transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
              Ver resultado e aplicar
            </Link>
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
