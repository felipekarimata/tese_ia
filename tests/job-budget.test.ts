import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  exceedsBudget,
  getJobCostCapUsd,
  runWithChapterBudget,
  recordUsage,
  JobBudgetExceededError,
} from '../lib/ai/job-budget';

test('exceedsBudget compara custo acumulado com o teto', () => {
  assert.equal(exceedsBudget(0.5, 1), false);
  assert.equal(exceedsBudget(1, 1), false); // igual ao teto não aborta
  assert.equal(exceedsBudget(1.0001, 1), true);
});

test('getJobCostCapUsd usa default US$ 1 quando env ausente/inválido', () => {
  const prev = process.env.JOB_COST_CAP_USD;
  delete process.env.JOB_COST_CAP_USD;
  assert.equal(getJobCostCapUsd(), 1);
  process.env.JOB_COST_CAP_USD = 'abc';
  assert.equal(getJobCostCapUsd(), 1);
  process.env.JOB_COST_CAP_USD = '2.5';
  assert.equal(getJobCostCapUsd(), 2.5);
  if (prev === undefined) delete process.env.JOB_COST_CAP_USD;
  else process.env.JOB_COST_CAP_USD = prev;
});

test('recordUsage acumula e aborta quando o custo do capítulo passa do teto', async () => {
  // Sem job corrente definido → não persiste no DB, só testa o acumulador/abort.
  await assert.rejects(
    runWithChapterBudget(
      'cap-test',
      async () => {
        await recordUsage({ model: 'gemini-x', tokensIn: 100, tokensOut: 100, costUsd: 0.4 });
        await recordUsage({ model: 'gemini-x', tokensIn: 100, tokensOut: 100, costUsd: 0.4 });
        // acumulado 0.8 — ainda ok
        await recordUsage({ model: 'gemini-x', tokensIn: 100, tokensOut: 100, costUsd: 0.5 });
        // acumulado 1.3 > 1.0 → deve lançar
        return 'não deveria chegar aqui';
      },
      1 // cap US$ 1
    ),
    (err: unknown) => err instanceof JobBudgetExceededError
  );
});

test('recordUsage é no-op fora de um contexto de budget', async () => {
  // Não deve lançar nem exigir DB.
  await recordUsage({ model: 'gemini-x', tokensIn: 10, tokensOut: 10, costUsd: 999 });
  assert.ok(true);
});
