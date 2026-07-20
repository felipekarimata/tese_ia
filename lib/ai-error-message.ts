/**
 * Mensagens amigáveis para erros de IA no frontend.
 * Distingue créditos esgotados (quota) de rate limit temporário.
 */

const QUOTA_EXHAUSTED_KEYWORDS = [
  'insufficient_quota',
  'exceeded your current quota',
  'billing details',
  'quota exceeded',
  'no credit',
  'out of credits',
  'créditos',
  'credit balance',
];

const RATE_LIMIT_KEYWORDS = [
  '429',
  'too many requests',
  'rate limit',
  'rate_limit',
  'rate-limit',
  'retry in',
  'requests per minute',
  'rpm',
];

const AUTH_KEYWORDS = [
  '401',
  '403',
  'invalid api key',
  'unauthorized',
  'authentication',
  'invalid_api_key',
];

const MODEL_KEYWORDS = [
  'model not found',
  'not found for api version',
  'not supported for generatecontent',
  'models/',
  'does not exist',
  'unsupported model',
];

export type AIErrorKind = 'quota' | 'rate-limit' | 'auth' | 'model' | 'unknown';

export type AIErrorInfo = {
  kind: AIErrorKind;
  title: string;
  message: string;
  hint?: string;
  provider?: string;
  raw: string;
};

const PROVIDER_KEYWORDS: Array<[RegExp, string]> = [
  [/openai|gpt-/i, 'OpenAI'],
  [/gemini|google/i, 'Google Gemini'],
  [/anthropic|claude/i, 'Anthropic Claude'],
  [/grok|xai|x\.ai/i, 'xAI Grok'],
];

function detectProvider(text: string): string | undefined {
  for (const [re, name] of PROVIDER_KEYWORDS) {
    if (re.test(text)) return name;
  }
  return undefined;
}

function matchesAny(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((k) => lower.includes(k.toLowerCase()));
}

/**
 * Classifica e formata erro de IA para exibição na UI.
 */
export function classifyAIError(messageOrError: string | unknown): AIErrorInfo {
  const raw = typeof messageOrError === 'string'
    ? messageOrError
    : (messageOrError as any)?.message ?? (messageOrError as any)?.error ?? String(messageOrError ?? '');
  const text = String(raw).trim();
  const provider = detectProvider(text);
  const providerLabel = provider ? ` (${provider})` : '';

  if (matchesAny(text, QUOTA_EXHAUSTED_KEYWORDS)) {
    return {
      kind: 'quota',
      title: `Créditos esgotados${providerLabel}`,
      message: 'A chave de API está sem créditos disponíveis. As operações de IA não podem continuar até que você adicione créditos ou troque para outro provedor configurado.',
      hint: 'Acesse o painel do provedor para verificar plano e faturamento, ou configure outro provedor em Configurações.',
      provider,
      raw: text,
    };
  }

  if (matchesAny(text, RATE_LIMIT_KEYWORDS)) {
    return {
      kind: 'rate-limit',
      title: `Limite temporário atingido${providerLabel}`,
      message: 'O provedor recusou a requisição por excesso de chamadas. Aguarde alguns segundos e tente novamente.',
      hint: 'Se o erro persistir, reduza o ritmo das operações ou troque de provedor em Configurações.',
      provider,
      raw: text,
    };
  }

  if (matchesAny(text, AUTH_KEYWORDS)) {
    return {
      kind: 'auth',
      title: `Chave de API inválida${providerLabel}`,
      message: 'A chave de API foi rejeitada pelo provedor. Verifique se está correta e ativa em Configurações.',
      provider,
      raw: text,
    };
  }

  if (matchesAny(text, MODEL_KEYWORDS)) {
    return {
      kind: 'model',
      title: `Modelo indisponível${providerLabel}`,
      message: 'O modelo selecionado não está disponível para essa chave, região ou versão da API. Troque o modelo em Configurações ou selecione outro modelo no topo da página.',
      hint: 'Para Gemini, tente gemini-2.5-flash quando um modelo preview falhar.',
      provider,
      raw: text,
    };
  }

  return {
    kind: 'unknown',
    title: 'Erro ao acessar o modelo de IA',
    message: text || 'Erro desconhecido durante a chamada à IA.',
    raw: text,
  };
}

export function isQuotaExhausted(messageOrError: string | unknown): boolean {
  return classifyAIError(messageOrError).kind === 'quota';
}

export function isRateLimitOrQuotaError(messageOrError: string | unknown): boolean {
  const k = classifyAIError(messageOrError).kind;
  return k === 'quota' || k === 'rate-limit';
}

/**
 * Mantida para compatibilidade com chamadas existentes.
 */
export function getAIErrorMessage(messageOrError: string | unknown, fallback = 'Erro ao acessar o modelo de IA.'): string {
  const info = classifyAIError(messageOrError);
  if (info.kind === 'unknown' && !info.message) return fallback;
  return `${info.title}. ${info.message}`;
}
