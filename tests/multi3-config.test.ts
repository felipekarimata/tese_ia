import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_MODELS } from '../lib/ai/model-registry';
import {
  DEFAULT_MULTI3_SETTINGS,
  isValidTodosProviderSelection,
  normalizeMulti3Settings,
  resolveMulti3Model,
} from '../lib/multi-ai/models';
import { isMulti3Command, parseMulti3Input } from '../lib/multi-ai/parser';

const defaults = {
  providers: ['openai', 'gemini', 'anthropic'] as const,
  judgeProvider: 'grok' as const,
};

test('/todos alone starts exactly three configured candidates and the configured judge', () => {
  const parsed = parseMulti3Input('/todos', {
    providers: [...defaults.providers],
    judgeProvider: defaults.judgeProvider,
  });

  assert.equal(parsed.kind, 'start');
  if (parsed.kind === 'start') {
    assert.deepEqual(parsed.providers, [...defaults.providers]);
    assert.equal(parsed.judgeProvider, 'grok');
    assert.equal(parsed.command, '/todos');
  }
  assert.equal(isMulti3Command('/todos'), true);
});

test('legacy /3 combinations and /livro are no longer multi-AI commands', () => {
  for (const input of ['/3', '/todos /3', '/3 /todos', '/revisar /3', '/livro']) {
    assert.equal(parseMulti3Input(input, { providers: [...defaults.providers] }).kind, 'not_multi3');
  }
});

test('/todos requires exactly three different supported providers', () => {
  assert.equal(parseMulti3Input('/todos', { providers: ['openai', 'gemini'] }).kind, 'not_multi3');
  assert.equal(
    parseMulti3Input('/todos', { providers: ['openai', 'gemini', 'anthropic', 'grok'] }).kind,
    'not_multi3'
  );
  assert.equal(isValidTodosProviderSelection(['openai', 'gemini', 'anthropic']), true);
  assert.equal(isValidTodosProviderSelection(['openai', 'openai', 'anthropic']), false);
});

test('invalid persisted provider selection resets to OpenAI, Gemini and Claude', () => {
  const settings = normalizeMulti3Settings({ defaultProviders: ['openai', 'grok'] });
  assert.deepEqual(settings.defaultProviders, DEFAULT_MULTI3_SETTINGS.defaultProviders);
  assert.deepEqual(settings.defaultProviders, ['openai', 'gemini', 'anthropic']);
});

test('OpenAI default for /todos resolves to GPT-5.6 Terra', () => {
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
