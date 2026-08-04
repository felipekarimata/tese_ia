import { AIProvider } from '@/lib/ai/types';
import { Multi3Command, DEFAULT_JUDGE_PROVIDER } from './types';

export type ParsedMulti3Command =
  | {
      kind: 'start';
      providers: AIProvider[];
      judgeProvider: AIProvider;
      command: Multi3Command;
      args: string;
    }
  | { kind: 'choose'; provider: AIProvider }
  | { kind: 'decide'; judgeProvider: AIProvider }
  | { kind: 'not_multi3' };

export type Multi3ParseDefaults = {
  providers?: AIProvider[];
  judgeProvider?: AIProvider;
};

/**
 * O fluxo Multi-IA agora possui uma única entrada pública: /todos.
 * Os três candidatos e o juiz vêm das Configurações.
 */
export function parseMulti3Input(
  raw: string,
  defaults?: Multi3ParseDefaults
): ParsedMulti3Command {
  if (raw.trim().toLowerCase() !== '/todos') return { kind: 'not_multi3' };

  const providers = (defaults?.providers ?? []).filter(
    (provider, index, list) => list.indexOf(provider) === index
  );
  if (providers.length !== 3) return { kind: 'not_multi3' };

  return {
    kind: 'start',
    providers,
    judgeProvider: defaults?.judgeProvider ?? DEFAULT_JUDGE_PROVIDER,
    command: '/todos',
    args: '',
  };
}

export function isMulti3Command(raw: string): boolean {
  return raw.trim().toLowerCase() === '/todos';
}

export function explainMulti3ParseFailure(_raw?: string): string {
  return 'Use /todos sozinho. Os três modelos candidatos e o juiz são definidos em Configurações.';
}
