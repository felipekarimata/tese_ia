import type { Multi3Candidate, Multi3Session, Multi3TodosStage } from './types';

export const MULTI3_TODOS_STAGES: Array<{
  id: Exclude<Multi3TodosStage, 'starting' | 'completed'> | 'judge';
  label: string;
}> = [
  { id: 'translate', label: 'Traduzir' },
  { id: 'review', label: 'Revisar' },
  { id: 'improve', label: 'Aprimorar' },
  { id: 'finalize', label: 'Finalizar' },
  { id: 'judge', label: 'Juiz' },
];

export const MULTI3_STAGE_RANGES: Record<
  Exclude<Multi3TodosStage, 'starting' | 'completed'>,
  [number, number]
> = {
  translate: [5, 30],
  review: [30, 55],
  improve: [55, 78],
  finalize: [78, 100],
};

export function clampProgress(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, Math.round(number)));
}

export function stageOverallProgress(
  stage: Exclude<Multi3TodosStage, 'starting' | 'completed'>,
  stageProgress: number
): number {
  const [start, end] = MULTI3_STAGE_RANGES[stage];
  const local = clampProgress(stageProgress);
  return Math.min(99, Math.round(start + ((end - start) * local) / 100));
}

export function multi3OverallProgress(
  session: Pick<Multi3Session, 'status' | 'candidates'> | {
    status?: string;
    candidates?: Multi3Candidate[];
  }
): number {
  const status = String(session.status || 'running');
  if (status === 'accepted' || status === 'awaiting_human') return 100;

  const candidates = session.candidates || [];
  if (candidates.length === 0) return 0;

  const candidateAverage = candidates.reduce((sum, candidate) => {
    if (candidate.status === 'completed') return sum + 100;
    return sum + clampProgress(candidate.progress);
  }, 0) / candidates.length;

  // Candidate work occupies the first 90%; judging occupies the final 10%.
  const candidateWeighted = Math.round(candidateAverage * 0.9);
  if (status === 'judging') return Math.max(95, candidateWeighted);
  if (status === 'candidates_ready') return Math.max(90, candidateWeighted);
  return Math.min(status === 'failed' ? 99 : 89, candidateWeighted);
}

export function candidateBatchLabel(candidate: Multi3Candidate): string | null {
  const current = Number(candidate.currentBatch || 0);
  const total = Number(candidate.totalBatches || 0);
  if (current <= 0 || total <= 0) return null;
  return `Lote ${Math.min(current, total)} de ${total}`;
}
