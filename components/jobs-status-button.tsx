'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Activity, Loader2, CheckCircle2, XCircle, Languages, Sliders, Wand2,
  Sparkles, SearchCheck, ExternalLink, FileText, ChevronRight, X, Ban, GitCompare
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { classifyAIError } from '@/lib/ai-error-message';
import { toast } from 'sonner';

type ActiveJob = {
  id: string;
  type: 'translate' | 'adjust' | 'adapt' | 'improve' | 'norms-update' | 'chapter-operation' | 'multi3';
  operation?: string;
  status: 'pending' | 'running' | 'completed' | 'error' | 'cancelled';
  progress: number;
  errorMessage?: string;
  createdAt: string;
  completedAt: string | null;
  target: {
    kind: 'document' | 'chapter';
    id: string;
    title?: string;
    projectId?: string;
    thesisId?: string;
  };
  resultHref: string;
};

export async function cancelJobRequest(jobId: string, type: ActiveJob['type']): Promise<boolean> {
  try {
    const res = await fetch('/api/jobs/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId, type }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || 'Falha ao cancelar');
      return false;
    }
    toast.success('Cancelamento solicitado. A operação para na próxima chamada à IA.');
    return true;
  } catch (e: any) {
    toast.error(e.message || 'Falha ao cancelar');
    return false;
  }
}

const POLL_INTERVAL_MS = 4000;

const OP_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  translate:     { label: 'Tradução',  icon: <Languages   className="h-3.5 w-3.5" />, color: 'text-purple-400' },
  adjust:        { label: 'Ajuste',    icon: <Sliders     className="h-3.5 w-3.5" />, color: 'text-orange-400' },
  adapt:         { label: 'Adaptação', icon: <Wand2       className="h-3.5 w-3.5" />, color: 'text-pink-400' },
  improve:       { label: 'Melhoria',  icon: <Sparkles    className="h-3.5 w-3.5" />, color: 'text-green-400' },
  'norms-update':{ label: 'Revisão de normas', icon: <SearchCheck className="h-3.5 w-3.5" />, color: 'text-yellow-400' },
  update:        { label: 'Revisão de normas', icon: <SearchCheck className="h-3.5 w-3.5" />, color: 'text-yellow-400' },
  multi3:        { label: 'Multi-IA /3', icon: <GitCompare className="h-3.5 w-3.5" />, color: 'text-indigo-400' },
};

function metaFor(job: ActiveJob) {
  if (job.type === 'multi3') {
    const cmd = job.operation?.replace('/', '') || 'comando';
    return { label: `Multi-IA /3 (${cmd})`, icon: <GitCompare className="h-3.5 w-3.5" />, color: 'text-indigo-400' };
  }
  const key = job.type === 'chapter-operation' ? (job.operation || 'unknown') : job.type;
  return OP_META[key] ?? { label: key, icon: <FileText className="h-3.5 w-3.5" />, color: 'text-gray-400' };
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return `${sec}s atrás`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}min atrás`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h atrás`;
  const day = Math.floor(hr / 24);
  return `${day}d atrás`;
}

export function JobsStatusButton() {
  const [open, setOpen] = useState(false);
  const [jobs, setJobs] = useState<ActiveJob[]>([]);
  const [runningCount, setRunningCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const fetchJobs = async () => {
    try {
      const res = await fetch('/api/jobs/active');
      if (!res.ok) return;
      const data = await res.json();
      setJobs(data.jobs || []);
      setRunningCount(data.runningCount || 0);
    } catch {
      // silent
    }
  };

  // Initial load + polling
  useEffect(() => {
    fetchJobs();
    const id = setInterval(fetchJobs, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const running = jobs.filter((j) => j.status === 'running' || j.status === 'pending');
  const recent  = jobs.filter((j) => j.status === 'completed' || j.status === 'error' || j.status === 'cancelled').slice(0, 10);

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        onClick={() => {
          setOpen((o) => !o);
          if (!open) fetchJobs();
        }}
        className={cn(
          'relative h-9 px-3 rounded-lg flex items-center gap-1.5 text-sm font-medium transition-all border',
          runningCount > 0
            ? 'text-red-300 bg-red-500/10 border-red-500/30 hover:bg-red-500/15'
            : 'text-gray-400 border-white/10 hover:text-white hover:bg-white/5'
        )}
        title="Operações em andamento"
      >
        {runningCount > 0 ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Activity className="h-4 w-4" />
        )}
        <span className="hidden sm:inline">Operações</span>
        {runningCount > 0 && (
          <span className="ml-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold">
            {runningCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] w-[380px] max-h-[480px] bg-gray-950 border border-white/10 rounded-xl shadow-2xl shadow-black/50 overflow-hidden flex flex-col z-50">
          {/* Header */}
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-red-400" />
              <h3 className="text-sm font-semibold text-white">Operações de IA</h3>
            </div>
            <button onClick={() => setOpen(false)} className="text-gray-500 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto">
            {jobs.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <Activity className="h-10 w-10 mx-auto mb-3 text-gray-700" />
                <p className="text-sm text-gray-400">Nenhuma operação recente</p>
                <p className="text-xs text-gray-600 mt-1">
                  Operações iniciadas continuam rodando mesmo se você sair da página.
                </p>
              </div>
            ) : (
              <>
                {running.length > 0 && (
                  <div>
                    <p className="px-4 pt-3 pb-1.5 text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
                      Em andamento ({running.length})
                    </p>
                    {running.map((job) => <JobRow key={job.id} job={job} onClick={() => setOpen(false)} onAfterCancel={fetchJobs} />)}
                  </div>
                )}

                {recent.length > 0 && (
                  <div className={cn(running.length > 0 && 'border-t border-white/5 mt-1')}>
                    <p className="px-4 pt-3 pb-1.5 text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
                      Recentes
                    </p>
                    {recent.map((job) => <JobRow key={job.id} job={job} onClick={() => setOpen(false)} />)}
                  </div>
                )}
              </>
            )}
          </div>

        </div>
      )}
    </div>
  );
}

function JobRow({ job, onClick, onAfterCancel }: { job: ActiveJob; onClick: () => void; onAfterCancel?: () => void }) {
  const meta = metaFor(job);
  const isRunning = job.status === 'running' || job.status === 'pending';
  const isError = job.status === 'error';
  const isDone = job.status === 'completed';
  const isCancelled = job.status === 'cancelled';
  const errInfo = isError && job.errorMessage ? classifyAIError(job.errorMessage) : null;

  const handleCancel = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('Cancelar esta operação? A IA para na próxima chamada — você economiza créditos a partir daí.')) return;
    const ok = await cancelJobRequest(job.id, job.type);
    if (ok) onAfterCancel?.();
  };

  return (
    <Link
      href={job.resultHref}
      onClick={onClick}
      className="block px-4 py-2.5 hover:bg-white/[0.04] transition-colors border-l-2 border-transparent hover:border-red-500/40"
    >
      <div className="flex items-start gap-3">
        <div className={cn('p-1.5 rounded-md bg-white/5 flex-shrink-0', meta.color)}>
          {meta.icon}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium text-white truncate">{meta.label}</span>
            {isRunning && <Loader2 className="h-3 w-3 text-red-400 animate-spin flex-shrink-0" />}
            {isDone && <CheckCircle2 className="h-3 w-3 text-green-400 flex-shrink-0" />}
            {isError && <XCircle className="h-3 w-3 text-red-400 flex-shrink-0" />}
            {isCancelled && <Ban className="h-3 w-3 text-gray-400 flex-shrink-0" />}
          </div>

          <p className="text-xs text-gray-500 truncate mt-0.5">
            {job.target.title || (job.target.kind === 'chapter' ? 'Capítulo' : 'Documento')}
            <span className="text-gray-700"> · {timeAgo(job.createdAt)}</span>
          </p>

          {isRunning && job.progress > 0 && (
            <div className="mt-1.5 h-1 bg-white/5 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-red-500 to-red-600 transition-all duration-500"
                style={{ width: `${job.progress}%` }}
              />
            </div>
          )}

          {isError && errInfo && (
            <p className="text-[11px] text-red-400 mt-1 truncate" title={errInfo.message}>
              {errInfo.title}
            </p>
          )}

          {isCancelled && (
            <p className="text-[11px] text-gray-500 mt-1 italic">
              Cancelado pelo usuário
            </p>
          )}
        </div>

        {isRunning ? (
          <button
            onClick={handleCancel}
            className="flex-shrink-0 mt-0.5 p-1 rounded-md text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            title="Cancelar operação para parar de gastar créditos"
          >
            <Ban className="h-3.5 w-3.5" />
          </button>
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-gray-700 flex-shrink-0 mt-1" />
        )}
      </div>
    </Link>
  );
}
