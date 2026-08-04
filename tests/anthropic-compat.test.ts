import assert from 'node:assert/strict';
import test from 'node:test';
import {
  anthropicTemperatureOption,
  isAnthropicClaude5Family,
} from '../lib/ai/anthropic-compat';

test('Claude 5 models omit the deprecated temperature parameter', () => {
  assert.equal(isAnthropicClaude5Family('claude-opus-5'), true);
  assert.equal(isAnthropicClaude5Family('claude-sonnet-5-20260801'), true);
  assert.deepEqual(anthropicTemperatureOption('claude-opus-5', 0.3), {});
});

test('earlier Claude families retain temperature support', () => {
  assert.equal(isAnthropicClaude5Family('claude-opus-4-6'), false);
  assert.equal(isAnthropicClaude5Family('claude-haiku-4-5'), false);
  assert.deepEqual(anthropicTemperatureOption('claude-opus-4-6', 0.3), { temperature: 0.3 });
});

test('undefined temperature remains omitted for every model', () => {
  assert.deepEqual(anthropicTemperatureOption('claude-opus-4-6', undefined), {});
});
