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

export type Multi3ParseDefaults = {
  providers?: AIProvider[];
  judgeProvider?: AIProvider;
};

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

function splitTokens(value: string): string[] {
  return value.replace(/,/g, ' ').split(/\s+/).filter(Boolean);
}

function resolvedProviders(
  explicit: AIProvider[],
  defaults?: Multi3ParseDefaults
): AIProvider[] | null {
  if (explicit.length >= 2) return explicit;
  if (explicit.length === 1) return null;
  const configured = defaults?.providers?.filter(
    (provider, index, list) => list.indexOf(provider) === index
  ) ?? [];
  return configured.length >= 2 ? configured : null;
}

function startResult(
  providers: AIProvider[] | null,
  command: Multi3Command,
  args: string,
  defaults?: Multi3ParseDefaults
): ParsedMulti3Command {
  if (!providers) return { kind: 'not_multi3' };
  return {
    kind: 'start',
    providers,
    judgeProvider: defaults?.judgeProvider ?? DEFAULT_JUDGE_PROVIDER,
    command,
    args,
  };
}

/**
 * Parse:
 *   /3 gemini openai claude /ajustar instruções
 *   /todos /3 gemini openai claude
 *   /todos /3
 *   /revisar /3
 *   /revisar /3 gemini openai
 *   /3 escolher claude
 *   /3 decidir openai
 */
export function parseMulti3Input(
  raw: string,
  defaults?: Multi3ParseDefaults
): ParsedMulti3Command {
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

  // Natural suffix form: /revisar /3 [providers] or /ajustar instrucao /3.
  const allTokens = splitTokens(trimmed);
  const multiIndex = allTokens.findIndex((token) => token.toLowerCase() === '/3');
  if (multiIndex > 0) {
    const command = allTokens[0].toLowerCase();
    if (!KNOWN_COMMANDS.has(command)) return { kind: 'not_multi3' };
    const { providers: explicit, rest } = parseProviders(allTokens.slice(multiIndex + 1));
    if (rest.length > 0) return { kind: 'not_multi3' };
    return startResult(
      resolvedProviders(explicit, defaults),
      command as Multi3Command,
      allTokens.slice(1, multiIndex).join(' '),
      defaults
    );
  }

  // /3 providers... /command args
  if (!trimmed.toLowerCase().startsWith('/3')) return { kind: 'not_multi3' };

  const withoutPrefix = trimmed.slice(3).trim();
  const tokens = splitTokens(withoutPrefix);
  const { providers: explicit, rest } = parseProviders(tokens);
  const providers = resolvedProviders(explicit, defaults);
  if (!providers) return { kind: 'not_multi3' };

  if (rest.length === 0) {
    return startResult(providers, '/perguntar', '', defaults);
  }

  const cmdToken = rest[0].toLowerCase();
  if (!KNOWN_COMMANDS.has(cmdToken)) {
    // /3 gemini openai claude pergunta livre (legacy style from user examples)
    return startResult(providers, '/perguntar', rest.join(' '), defaults);
  }

  return startResult(
    providers,
    cmdToken as Multi3Command,
    rest.slice(1).join(' '),
    defaults
  );
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
  if (!trimmed.toLowerCase().includes('/3')) {
    return `Use /3 antes ou depois do comando. Exemplo: /revisar /3`;
  }

  if (!trimmed.toLowerCase().startsWith('/3')) {
    return `Use provedores validos apos /3 ou configure os padroes. Exemplo: /revisar /3 gemini openai`;
  }

  const withoutPrefix = trimmed.slice(3).trim();
  const tokens = splitTokens(withoutPrefix);

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.startsWith('/')) break;
    if (!resolveProvider(t)) {
      return `Provedor não reconhecido: "${t}". Use: ${PROVIDER_HINT}. Exemplo: /3 gemini openai claude /perguntar qual o tema do documento`;
    }
  }

  const { providers } = parseProviders(tokens);
  if (providers.length < 2) {
    return `Configure pelo menos 2 provedores padrao ou informe-os no comando. Exemplo: /3 gemini openai /revisar`;
  }

  return `Não foi possível interpretar o comando /3. Exemplo: /3 gemini openai claude /perguntar qual o tema do documento`;
}
