/**
 * Budget de custo por capítulo para operações de IA.
 *
 * Usa AsyncLocalStorage para propagar um acumulador de custo ao longo de toda
 * a pipeline de um capítulo, sem precisar passar jobId por dezenas de
 * call-sites. Cada chamada de IA registra seu uso via `recordUsage()`; quando o
 * custo acumulado do capítulo ultrapassa o teto, lança `JobBudgetExceededError`
 * — abortando a pipeline em vez de continuar queimando créditos.
 *
 * O uso também é persistido (best-effort) nas colunas de `chapter_operation_jobs`
 * do job corrente, servindo de auditoria de custo.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { supabase } from '@/lib/supabase';

export interface UsageRecord {
  model: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
}

interface BudgetContext {
  chapterId: string;
  capUsd: number;
  currentJobId?: string;
  totals: { calls: number; tokensIn: number; tokensOut: number; costUsd: number };
}

export class JobBudgetExceededError extends Error {
  constructor(
    public readonly chapterId: string,
    public readonly spentUsd: number,
    public readonly capUsd: number
  ) {
    super(
      `Budget de custo excedido para o capítulo ${chapterId}: ` +
        `US$ ${spentUsd.toFixed(4)} > US$ ${capUsd.toFixed(2)}. Operação abortada.`
    );
    this.name = 'JobBudgetExceededError';
  }
}

const storage = new AsyncLocalStorage<BudgetContext>();

/** Teto de custo por capítulo, em USD. Configurável via env, default US$ 1. */
export function getJobCostCapUsd(): number {
  const parsed = Number(process.env.JOB_COST_CAP_USD ?? '');
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

/**
 * Decisão pura (testável): dado o custo acumulado e o teto, deve abortar?
 */
export function exceedsBudget(spentUsd: number, capUsd: number): boolean {
  return spentUsd > capUsd;
}

/**
 * Executa `fn` dentro de um contexto de budget para o capítulo. Todas as
 * chamadas de IA feitas dentro de `fn` são contabilizadas no mesmo acumulador.
 */
export function runWithChapterBudget<T>(
  chapterId: string,
  fn: () => Promise<T>,
  capUsd: number = getJobCostCapUsd()
): Promise<T> {
  const ctx: BudgetContext = {
    chapterId,
    capUsd,
    totals: { calls: 0, tokensIn: 0, tokensOut: 0, costUsd: 0 },
  };
  return storage.run(ctx, fn);
}

/** Define o job corrente (para persistir o uso nas colunas certas). No-op fora de contexto. */
export function setCurrentBudgetJob(jobId: string): void {
  const ctx = storage.getStore();
  if (ctx) ctx.currentJobId = jobId;
}

/**
 * Registra o uso de uma chamada de IA. No-op se não houver contexto de budget
 * (ex.: chamadas fora da pipeline de capítulo). Lança JobBudgetExceededError
 * se o custo acumulado do capítulo passar do teto.
 */
export async function recordUsage(usage: UsageRecord): Promise<void> {
  const ctx = storage.getStore();
  if (!ctx) return;

  ctx.totals.calls += 1;
  ctx.totals.tokensIn += usage.tokensIn;
  ctx.totals.tokensOut += usage.tokensOut;
  ctx.totals.costUsd += usage.costUsd;

  // Persiste o uso no job corrente (best-effort; não bloqueia o fluxo em erro de DB).
  if (ctx.currentJobId) {
    await persistJobUsage(ctx.currentJobId, usage).catch((err) => {
      console.warn('[JOB-BUDGET] Falha ao persistir uso do job:', err?.message ?? err);
    });
  }

  if (exceedsBudget(ctx.totals.costUsd, ctx.capUsd)) {
    throw new JobBudgetExceededError(ctx.chapterId, ctx.totals.costUsd, ctx.capUsd);
  }
}

async function persistJobUsage(jobId: string, usage: UsageRecord): Promise<void> {
  const { data, error } = await supabase
    .from('chapter_operation_jobs')
    .select('ai_calls_count, tokens_in, tokens_out, cost_usd')
    .eq('id', jobId)
    .single();

  if (error || !data) return;

  const row = data as any;
  const dbUpdates: any = {
    ai_calls_count: (row.ai_calls_count ?? 0) + 1,
    tokens_in: (row.tokens_in ?? 0) + usage.tokensIn,
    tokens_out: (row.tokens_out ?? 0) + usage.tokensOut,
    cost_usd: Number(row.cost_usd ?? 0) + usage.costUsd,
    model: usage.model,
  };

  await supabase.from('chapter_operation_jobs').update(dbUpdates).eq('id', jobId);
}
