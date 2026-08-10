'use client';

import { AlertCircle, CheckCircle2, Circle, Loader2, Scale } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import type { Multi3Candidate, Multi3Session, Multi3TodosStage } from '@/lib/multi-ai/types';
import {
  MULTI3_TODOS_STAGES,
  candidateBatchLabel,
  clampProgress,
  multi3OverallProgress,
} from '@/lib/multi-ai/progress';

const PROVIDER_LABEL: Record<string, string> = {
  openai: 'OpenAI',
  gemini: 'Gemini',
  anthropic: 'Claude',
  grok: 'Grok',
};

const STAGE_INDEX: Record<Multi3TodosStage, number> = {
  starting: -1,
  translate: 0,
  review: 1,
  improve: 2,
  finalize: 3,
  completed: 4,
};

function stageState(
  session: Multi3Session,
  stageIndex: number
): 'pending' | 'running' | 'completed' | 'failed' {
  if (stageIndex === 4) {
    if (session.status === 'failed') return 'failed';
    if (session.status === 'judging' || session.status === 'candidates_ready') return 'running';
    if (session.status === 'accepted' || session.status === 'awaiting_human') return 'completed';
    return 'pending';
  }

  const candidates = (session.candidates || []).filter((candidate) => candidate.role !== 'judge-final');
  if (candidates.some((candidate) => candidate.status === 'failed' && STAGE_INDEX[candidate.stage || 'starting'] === stageIndex)) {
    return 'failed';
  }
  if (candidates.some((candidate) => candidate.status === 'running' && STAGE_INDEX[candidate.stage || 'starting'] === stageIndex)) {
    return 'running';
  }
  if (candidates.length > 0 && candidates.every((candidate) => {
    if (candidate.status === 'completed') return true;
    return STAGE_INDEX[candidate.stage || 'starting'] > stageIndex;
  })) {
    return 'completed';
  }
  return 'pending';
}

function CandidateRow({ candidate }: { candidate: Multi3Candidate }) {
  const progress = candidate.status === 'completed' ? 100 : clampProgress(candidate.progress);
  const batch = candidateBatchLabel(candidate);
  const isRunning = candidate.status === 'running';
  const isFailed = candidate.status === 'failed';

  return (
    <div className="rounded-lg border border-white/10 bg-black/15 p-2.5 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-medium text-gray-200">
            {PROVIDER_LABEL[candidate.provider] || candidate.provider}
          </div>
          <div className="truncate text-[10px] text-gray-500" title={candidate.model}>
            {candidate.model}
          </div>
        </div>
        <div className={cn(
          'flex shrink-0 items-center gap-1 text-[11px] font-medium',
          isFailed ? 'text-red-400' : candidate.status === 'completed' ? 'text-emerald-400' : 'text-gray-300'
        )}>
          {isRunning && <Loader2 className="h-3 w-3 animate-spin" />}
          {candidate.status === 'completed' && <CheckCircle2 className="h-3 w-3" />}
          {isFailed && <AlertCircle className="h-3 w-3" />}
          {progress}%
        </div>
      </div>

      <Progress value={progress} className="h-1.5 bg-white/10" />

      <div className="flex items-center justify-between gap-3 text-[10px]">
        <span className={cn('truncate', isFailed ? 'text-red-400' : 'text-gray-400')}>
          {isFailed ? candidate.error || 'Falha neste modelo' : candidate.progressLabel || 'Aguardando início'}
        </span>
        {batch && <span className="shrink-0 text-gray-500">{batch}</span>}
      </div>
    </div>
  );
}

export function Multi3ProgressCard({ session }: { session: Multi3Session }) {
  const overall = multi3OverallProgress(session);
  const judgeRunning = session.status === 'judging' || session.status === 'candidates_ready';
  const judgeDone = session.status === 'accepted' || session.status === 'awaiting_human';
  const sourceCandidates = (session.candidates || []).filter((candidate) => candidate.role !== 'judge-final');
  const judgeCandidate = (session.candidates || []).find((candidate) => candidate.role === 'judge-final');
  const judgeBatch = judgeCandidate ? candidateBatchLabel(judgeCandidate) : null;

  return (
    <div className="mt-2 w-full max-w-2xl rounded-xl border border-red-500/20 bg-red-950/10 p-3 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold text-gray-200">Andamento do /todos</div>
          <div className="text-[10px] text-gray-500">3 modelos em paralelo + redação final</div>
        </div>
        <span className="text-sm font-semibold tabular-nums text-red-300">{overall}%</span>
      </div>

      <Progress value={overall} className="h-2 bg-white/10" />

      <div className="grid grid-cols-5 gap-1">
        {MULTI3_TODOS_STAGES.map((stage, index) => {
          const state = stageState(session, index);
          return (
            <div
              key={stage.id}
              className={cn(
                'flex min-w-0 flex-col items-center gap-1 rounded-md px-1 py-1.5 text-center',
                state === 'running' && 'bg-red-500/10 text-red-300',
                state === 'completed' && 'text-emerald-400',
                state === 'failed' && 'text-red-400',
                state === 'pending' && 'text-gray-600'
              )}
            >
              {state === 'running' ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : state === 'completed' ? (
                <CheckCircle2 className="h-3 w-3" />
              ) : state === 'failed' ? (
                <AlertCircle className="h-3 w-3" />
              ) : (
                <Circle className="h-3 w-3" />
              )}
              <span className="truncate text-[9px] leading-none">{stage.label}</span>
            </div>
          );
        })}
      </div>

      <div className="space-y-2">
        {sourceCandidates.map((candidate, index) => (
          <CandidateRow key={`${candidate.provider}-${candidate.branchIndex ?? index}`} candidate={candidate} />
        ))}
      </div>

      <div className={cn(
        'flex items-center gap-2 rounded-lg border px-2.5 py-2 text-[11px]',
        judgeRunning && 'border-amber-500/20 bg-amber-500/5 text-amber-300',
        judgeDone && 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400',
        !judgeRunning && !judgeDone && 'border-white/10 text-gray-500'
      )}>
        {judgeRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : judgeDone ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Scale className="h-3.5 w-3.5" />}
        <span className="min-w-0 truncate">
          Redator final: {PROVIDER_LABEL[session.judgeProvider] || session.judgeProvider}/{session.judgeModel || 'modelo configurado'}
          {judgeRunning
            ? ` — ${judgeCandidate?.progressLabel || 'preparando a síntese'}${judgeBatch ? ` (${judgeBatch})` : ''}`
            : judgeDone
              ? ' — redação final concluída'
              : ' — aguardando os candidatos'}
        </span>
      </div>
    </div>
  );
}
