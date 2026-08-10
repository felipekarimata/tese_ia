import { classifyAIError, getAIErrorMessage } from '@/lib/ai-error-message';
import { isCancellationErrorMessage } from '@/lib/job-cancellation';
import type { Multi3Candidate } from './types';
import { multi3OverallProgress } from './progress';

type SessionLike = {
  status?: string;
  judgeReasoning?: string;
  candidates?: Multi3Candidate[];
};

export function getMulti3FailureMessage(session: SessionLike): string {
  if (isCancellationErrorMessage(session.judgeReasoning)) {
    return 'Multi-IA cancelada pelo usuário.';
  }

  const failed = session.candidates?.filter((c) => c.status === 'failed') ?? [];
  if (failed.length === 0) {
    return session.judgeReasoning || 'Multi-IA falhou — nenhum candidato concluiu com sucesso.';
  }

  const summaries = failed.map((c) => {
    const info = classifyAIError(c.error || 'Erro desconhecido');
    return `${c.provider}: ${info.title}`;
  });

  const firstErr = failed.find((c) => c.error)?.error;
  if (firstErr) {
    return getAIErrorMessage(firstErr, `${summaries.join('; ')}.`);
  }

  return summaries.join('; ');
}

export function formatMulti3ProgressLine(session: SessionLike & { providers?: string[]; status?: string; command?: string }): string {
  const sourceCandidates = session.candidates?.filter((candidate) => candidate.role !== 'judge-final') ?? [];
  const total = session.providers?.length ?? sourceCandidates.length ?? 3;
  const done = sourceCandidates.filter((c) => c.status === 'completed').length;
  const failed = sourceCandidates.filter((c) => c.status === 'failed').length;
  const running = sourceCandidates.filter((c) => c.status === 'running');
  const status = session.status ?? 'running';
  const overall = multi3OverallProgress({ status, candidates: session.candidates });
  const cmd = session.command?.replace('/', '') || 'comando';
  const labels: Record<string, string> = {
    running: 'iniciando',
    processing: 'processando',
    candidates_ready: 'candidatos prontos',
    judging: 'redator final trabalhando',
    failed: 'falhou',
  };
  const phase = labels[status] || status;

  if (failed > 0) {
    const errCand = session.candidates?.find((c) => c.status === 'failed' && c.error);
    if (errCand) {
      const info = classifyAIError(errCand.error!);
      return `Multi-IA /${cmd}: ${info.title} — ${done}/${total} ok, ${failed} falhou`;
    }
    return `Multi-IA /${cmd}: ${phase} — ${done}/${total} ok, ${failed} falhou`;
  }

  if (status === 'judging') {
    const judgeCandidate = session.candidates?.find((candidate) => candidate.role === 'judge-final');
    const batch = judgeCandidate?.currentBatch && judgeCandidate?.totalBatches
      ? `, lote ${judgeCandidate.currentBatch}/${judgeCandidate.totalBatches}`
      : '';
    return `Multi-IA /${cmd}: ${overall}% — ${judgeCandidate?.progressLabel || phase}${batch}`;
  }

  if (running.length > 0 && done === 0) {
    const active = running
      .map((c) => `${c.provider}: ${c.progressLabel || 'iniciando'} (${Math.round(c.progress || 0)}%)`)
      .slice(0, 3)
      .join(', ');
    return `Multi-IA /${cmd}: ${overall}% — ${active}`;
  }

  return `Multi-IA /${cmd}: ${overall}% — ${phase}, ${done}/${total} concluídas`;
}
