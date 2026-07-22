import {
  AIProvider,
} from '@/lib/ai/types';
import {
  Multi3Command,
  PROVIDER_ALIASES,
  DEFAULT_JUDGE_PROVIDER,
} from './types';

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

const KNOWN_COMMANDS = new Set<string>([
  '/ajustar', '/adaptar', '/revisar', '/traduzir', '/todos', '/perguntar',
]);

function resolveProvider(token: string): AIProvider | null {
  return PROVIDER_ALIASES[token.toLowerCase()] ?? null;
}

function parseProviders(tokens: string[]): { providers: AIProvider[]; rest: string[] } {
  const providers: AIProvider[] = [];
  let i = 0;
  while (i < tokens.length) {
    const p = resolveProvider(tokens[i]);
    if (!p) break;
    if (!providers.includes(p)) providers.push(p);
    i++;
  }
  return { providers, rest: tokens.slice(i) };
}

/**
 * Parse:
 *   /3 gemini openai claude /ajustar instruções
 *   /todos /3 gemini openai claude
 *   /3 escolher claude
 *   /3 decidir openai
 */
export function parseMulti3Input(raw: string): ParsedMulti3Command {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('/')) return { kind: 'not_multi3' };

  // /3 escolher X | /3 decidir X
  const followUp = trimmed.match(/^\/3\s+(escolher|decidir)\s+(\S+)/i);
  if (followUp) {
    const provider = resolveProvider(followUp[2]);
    if (!provider) return { kind: 'not_multi3' };
    if (followUp[1].toLowerCase() === 'escolher') return { kind: 'choose', provider };
    return { kind: 'decide', judgeProvider: provider };
  }

  // /todos /3 providers...
  const todosMulti = trimmed.match(/^\/todos\s+\/3\s+(.+)/i);
  if (todosMulti) {
    const tokens = todosMulti[1].split(/\s+/).filter(Boolean);
    const { providers, rest } = parseProviders(tokens);
    if (providers.length < 2) return { kind: 'not_multi3' };
    return {
      kind: 'start',
      providers,
      judgeProvider: DEFAULT_JUDGE_PROVIDER,
      command: '/todos',
      args: rest.join(' '),
    };
  }

  // /3 providers... /command args
  if (!trimmed.toLowerCase().startsWith('/3')) return { kind: 'not_multi3' };

  const withoutPrefix = trimmed.slice(3).trim();
  const tokens = withoutPrefix.split(/\s+/).filter(Boolean);
  const { providers, rest } = parseProviders(tokens);

  if (providers.length < 2) return { kind: 'not_multi3' };

  if (rest.length === 0) {
    return {
      kind: 'start',
      providers,
      judgeProvider: DEFAULT_JUDGE_PROVIDER,
      command: '/perguntar',
      args: '',
    };
  }

  const cmdToken = rest[0].toLowerCase();
  if (!KNOWN_COMMANDS.has(cmdToken)) {
    // /3 gemini openai claude pergunta livre (legacy style from user examples)
    return {
      kind: 'start',
      providers,
      judgeProvider: DEFAULT_JUDGE_PROVIDER,
      command: '/perguntar',
      args: rest.join(' '),
    };
  }

  return {
    kind: 'start',
    providers,
    judgeProvider: DEFAULT_JUDGE_PROVIDER,
    command: cmdToken as Multi3Command,
    args: rest.slice(1).join(' '),
  };
}

export function isMulti3Command(raw: string): boolean {
  const parsed = parseMulti3Input(raw);
  return parsed.kind !== 'not_multi3';
}

const PROVIDER_HINT =
  'gemini (ou google), openai (ou gpt), claude, grok (ou xai/crok)';

/** When input starts with /3 but parseMulti3Input returns not_multi3, explain why. */
export function explainMulti3ParseFailure(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.toLowerCase().startsWith('/3')) {
    return `Use: /3 ${PROVIDER_HINT} /perguntar <pergunta>`;
  }

  const withoutPrefix = trimmed.slice(3).trim();
  const tokens = withoutPrefix.split(/\s+/).filter(Boolean);

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.startsWith('/')) break;
    if (!resolveProvider(t)) {
      return `Provedor não reconhecido: "${t}". Use: ${PROVIDER_HINT}. Exemplo: /3 gemini openai claude /perguntar qual o tema do documento`;
    }
  }

  const { providers } = parseProviders(tokens);
  if (providers.length < 2) {
    return `Informe pelo menos 2 provedores de IA. Exemplo: /3 gemini openai claude /perguntar qual o tema do documento`;
  }

  return `Não foi possível interpretar o comando /3. Exemplo: /3 gemini openai claude /perguntar qual o tema do documento`;
}
