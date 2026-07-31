export const BOOK_WORKFLOW_STEPS = [
  { number: 1, command: '/traduzir', label: 'Tradução para pt-BR' },
  { number: 2, command: '/revisar', label: 'Vigência e recontextualização' },
  { number: 3, command: '/ajustar', label: 'Instrução estrita do autor' },
  { number: 4, command: '/aprimorar', label: 'Expansão e atualização substancial' },
  { number: 5, command: '/finalizar', label: 'Coesão final do capítulo e do livro' },
] as const;

export type BookWorkflowStepNumber = 1 | 2 | 3 | 4 | 5;

export type BookWorkflowState = {
  status: 'active' | 'completed';
  nextStep: BookWorkflowStepNumber;
  authorInstruction: string;
  startedAt: string;
  updatedAt: string;
};

export type BookWorkflowAction =
  | { kind: 'start'; authorInstruction: string }
  | { kind: 'continue' }
  | { kind: 'status' }
  | { kind: 'reset' };

export function parseBookWorkflowAction(args: string): BookWorkflowAction {
  const trimmed = args.trim();
  const normalized = trimmed.toLocaleLowerCase('pt-BR');
  if (normalized === 'continuar' || normalized === 'aprovar') return { kind: 'continue' };
  if (normalized === 'status') return { kind: 'status' };
  if (normalized === 'reiniciar' || normalized === 'resetar') return { kind: 'reset' };
  return { kind: 'start', authorInstruction: trimmed };
}

export function createBookWorkflowState(authorInstruction: string, now = new Date()): BookWorkflowState {
  const instruction = authorInstruction.trim();
  if (!instruction) {
    throw new Error('Informe a instrução autoral do passo 3. Ex.: /livro preservar a conclusão original.');
  }
  const timestamp = now.toISOString();
  return {
    status: 'active',
    nextStep: 1,
    authorInstruction: instruction,
    startedAt: timestamp,
    updatedAt: timestamp,
  };
}

export function completeBookWorkflowStep(
  state: BookWorkflowState,
  completedStep: BookWorkflowStepNumber,
  now = new Date()
): BookWorkflowState {
  if (state.status !== 'active' || state.nextStep !== completedStep) return state;
  if (completedStep === 5) {
    return { ...state, status: 'completed', updatedAt: now.toISOString() };
  }
  return {
    ...state,
    nextStep: (completedStep + 1) as BookWorkflowStepNumber,
    updatedAt: now.toISOString(),
  };
}

export function formatBookWorkflowStatus(state: BookWorkflowState): string {
  if (state.status === 'completed') return 'Fluxo editorial concluído: os cinco passos foram executados.';
  const step = BOOK_WORKFLOW_STEPS[state.nextStep - 1];
  return `Fluxo editorial ativo. Próximo passo: ${step.number}/5 — ${step.label} (${step.command}).`;
}
