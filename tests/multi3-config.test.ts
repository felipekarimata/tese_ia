import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_MODELS } from '../lib/ai/model-registry';
import { normalizeMulti3Settings, resolveMulti3Model } from '../lib/multi-ai/models';
import { parseMulti3Input } from '../lib/multi-ai/parser';

const defaults = {
  providers: ['openai', 'gemini', 'anthropic', 'grok'] as const,
  judgeProvider: 'gemini' as const,
};

test('uses configured providers when /3 has no explicit provider list', () => {
  const suffix = parseMulti3Input('/revisar /3', { providers: [...defaults.providers], judgeProvider: defaults.judgeProvider });
  const prefix = parseMulti3Input('/3 /revisar', { providers: [...defaults.providers], judgeProvider: defaults.judgeProvider });
  const todos = parseMulti3Input('/todos /3', { providers: [...defaults.providers], judgeProvider: defaults.judgeProvider });

  for (const parsed of [suffix, prefix, todos]) {
    assert.equal(parsed.kind, 'start');
    if (parsed.kind === 'start') assert.deepEqual(parsed.providers, [...defaults.providers]);
  }
});

test('explicit providers override defaults before or after the command', () => {
  const suffix = parseMulti3Input('/revisar /3 gemini openai', { providers: [...defaults.providers] });
  const prefix = parseMulti3Input('/3 gemini,openai /revisar', { providers: [...defaults.providers] });

  assert.equal(suffix.kind, 'start');
  assert.equal(prefix.kind, 'start');
  if (suffix.kind === 'start') assert.deepEqual(suffix.providers, ['gemini', 'openai']);
  if (prefix.kind === 'start') assert.deepEqual(prefix.providers, ['gemini', 'openai']);
  assert.equal(parseMulti3Input('/revisar /3 gemini', { providers: [...defaults.providers] }).kind, 'not_multi3');
});

test('OpenAI and configured /3 defaults resolve to GPT-5.6 Terra', () => {
  assert.equal(DEFAULT_MODELS.openai, 'gpt-5.6-terra');
  const settings = normalizeMulti3Settings(null, {
    openai: ['gpt-5.6-terra', 'gpt-5.6-sol'],
  });
  assert.equal(settings.defaultModels.openai, 'gpt-5.6-terra');
  assert.equal(resolveMulti3Model('openai', { models: { openai: ['gpt-5.6-terra'] }, multi3: settings }), 'gpt-5.6-terra');
});

test('rejects a model belonging to another provider', () => {
  const settings = normalizeMulti3Settings(
    { defaultModels: { gemini: 'gpt-5.6-terra' } },
    { gemini: ['gemini-3.5-flash'] }
  );
  assert.equal(settings.defaultModels.gemini, 'gemini-3.5-flash');
});
