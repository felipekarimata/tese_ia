import { supabase } from '@/lib/supabase';
import {
  normalizeCommandPromptOverrides,
  renderBookAdjustInstructions,
  resolveCommandPrompt,
  type CommandPromptKey,
  type CommandPromptOverrides,
} from './prompts';

const SETTINGS_ID = '00000000-0000-0000-0000-000000000001';
const CACHE_TTL_MS = 10_000;

let cachedOverrides: CommandPromptOverrides | null = null;
let cacheExpiresAt = 0;

function isMissingCommandPromptsColumn(error: { code?: string; message?: string } | null): boolean {
  return Boolean(
    error
    && (error.code === 'PGRST204' || error.code === '42703')
    && error.message?.includes('command_prompts')
  );
}

export async function loadCommandPromptOverrides(options?: {
  force?: boolean;
  tolerateMissingMigration?: boolean;
  fallbackToDefaults?: boolean;
}): Promise<CommandPromptOverrides> {
  const now = Date.now();
  if (!options?.force && cachedOverrides && now < cacheExpiresAt) {
    return cachedOverrides;
  }

  // O tipo gerado do Supabase neste projeto ainda não cobre todas as tabelas
  // legadas; o formato é normalizado logo após a leitura.
  const { data, error } = await (supabase as any)
    .from('settings')
    .select('command_prompts')
    .eq('id', SETTINGS_ID)
    .maybeSingle();

  if (error) {
    if (options?.tolerateMissingMigration && isMissingCommandPromptsColumn(error)) {
      console.warn('[COMMAND PROMPTS] Migration 024 ainda não foi aplicada; usando padrões do código.');
      cachedOverrides = {};
      cacheExpiresAt = now + CACHE_TTL_MS;
      return cachedOverrides;
    }
    if (options?.fallbackToDefaults) {
      console.warn(
        `[COMMAND PROMPTS] Não foi possível ler a persistência; usando padrões do código: ${error.message}`
      );
      cachedOverrides = cachedOverrides ?? {};
      cacheExpiresAt = now + CACHE_TTL_MS;
      return cachedOverrides;
    }
    throw new Error(`Falha ao carregar prompts persistentes: ${error.message}`);
  }

  cachedOverrides = normalizeCommandPromptOverrides(data?.command_prompts);
  cacheExpiresAt = now + CACHE_TTL_MS;
  return cachedOverrides;
}

export async function saveCommandPromptOverrides(
  value: unknown
): Promise<CommandPromptOverrides> {
  const overrides = normalizeCommandPromptOverrides(value);
  const { error } = await (supabase as any)
    .from('settings')
    .upsert(
      { id: SETTINGS_ID, command_prompts: overrides },
      { onConflict: 'id' }
    );

  if (error) {
    if (isMissingCommandPromptsColumn(error)) {
      throw new Error(
        'A persistência dos prompts ainda não está instalada no banco. Aplique a migration 024 antes de salvar.'
      );
    }
    throw new Error(`Falha ao salvar prompts persistentes: ${error.message}`);
  }

  cachedOverrides = overrides;
  cacheExpiresAt = Date.now() + CACHE_TTL_MS;
  return overrides;
}

export async function getEffectiveCommandPrompt(key: CommandPromptKey): Promise<string> {
  const overrides = await loadCommandPromptOverrides({
    tolerateMissingMigration: true,
    fallbackToDefaults: true,
  });
  return resolveCommandPrompt(key, overrides);
}

export type AdjustableBookCommand = '/ajustar' | '/aprimorar' | '/finalizar';

export async function resolveBookCommandInstructions(
  command: AdjustableBookCommand,
  authorInstructions = ''
): Promise<string> {
  if (command === '/ajustar') {
    const template = await getEffectiveCommandPrompt('adjust');
    return renderBookAdjustInstructions(template, authorInstructions);
  }
  return getEffectiveCommandPrompt(command === '/aprimorar' ? 'improve' : 'finalize');
}

export function clearCommandPromptCache(): void {
  cachedOverrides = null;
  cacheExpiresAt = 0;
}
