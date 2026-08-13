import type { BookAssemblyStatus } from './types';

export function analysisProgress(completedChapters: number, totalChapters: number): number {
  if (totalChapters <= 0) return 12;
  return Math.min(34, 8 + Math.round((completedChapters / totalChapters) * 22));
}

export function harmonizationProgress(completedChapters: number, totalChapters: number): number {
  if (totalChapters <= 0) return 48;
  return Math.min(79, 42 + Math.round((completedChapters / totalChapters) * 37));
}

export function finalizationProgress(completedChapters: number, totalChapters: number): number {
  if (totalChapters <= 0) return 86;
  return Math.min(96, 84 + Math.round((completedChapters / totalChapters) * 12));
}

export function defaultProgressLabel(status: BookAssemblyStatus): string {
  switch (status) {
    case 'queued': return 'Preparando a montagem do livro';
    case 'analyzing': return 'Analisando a obra como um conjunto';
    case 'awaiting_plan_approval': return 'Plano editorial pronto para aprovação';
    case 'harmonizing': return 'Harmonizando os capítulos aprovados';
    case 'awaiting_changes_approval': return 'Alterações prontas para revisão';
    case 'finalizing': return 'Gerando a versão final do livro';
    case 'completed': return 'Livro concluído';
    case 'failed': return 'Processamento interrompido';
    case 'cancelled': return 'Montagem cancelada';
  }
}
