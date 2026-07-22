import { classifyAIError, getAIErrorMessage } from '@/lib/ai-error-message';
import { isCancellationErrorMessage } from '@/lib/job-cancellation';
import type { Multi3Candidate } from './types';

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
  const total = session.providers?.length ?? session.candidates?.length ?? 3;
  const done = session.candidates?.filter((c) => c.status === 'completed').length ?? 0;
  const failed = session.candidates?.filter((c) => c.status === 'failed').length ?? 0;
  const running = session.candidates?.filter((c) => c.status === 'running') ?? [];
  const status = session.status ?? 'running';
  const cmd = session.command?.replace('/', '') || 'comando';
  const labels: Record<string, string> = {
    running: 'iniciando',
    processing: 'processando',
    candidates_ready: 'candidatos prontos',
    judging: 'juiz avaliando',
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

  if (running.length > 0 && done === 0) {
    const active = running
      .map((c) => c.progressLabel || c.provider)
      .slice(0, 3)
      .join(', ');
    return `Multi-IA /${cmd}: ${phase} — ${active} (${done}/${total})`;
  }

  return `Multi-IA /${cmd}: ${phase} — ${done}/${total} concluídas`;
}
