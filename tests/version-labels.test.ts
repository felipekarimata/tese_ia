import assert from 'node:assert/strict';
import test from 'node:test';
import {
  chapterVersionLabel,
  chapterVersionSelectorGroups,
} from '../lib/thesis/version-labels';

const version = (
  id: string,
  versionNumber: number,
  createdByOperation: string,
  metadata?: Record<string, unknown>,
  isCurrent = false
) => ({ id, versionNumber, createdByOperation, metadata, isCurrent });

test('nomeia finais dos modelos e a redação final de forma explicativa', () => {
  assert.equal(
    chapterVersionLabel(version('openai-final', 25, 'adjust', {
      multi3Provider: 'openai',
      multi3Model: 'gpt-5.6-terra',
      multi3Step: 'finalize',
    })),
    'v25 - Final OpenAI · gpt-5.6-terra'
  );

  assert.equal(
    chapterVersionLabel(version('judge', 28, 'improve', {
      multi3Provider: 'gemini',
      judgeModel: 'gemini-3.5-flash',
      multi3Role: 'judge-final',
    }, true)),
    'v28 - Redação final (Google Gemini · gemini-3.5-flash) · atual'
  );
});

test('prioriza finais e separa checkpoints intermediários', () => {
  const versions = [
    version('original', 1, 'upload'),
    version('translate', 16, 'translate', { multi3Provider: 'openai', multi3Step: 'translate' }),
    version('improve', 24, 'improve', { multi3Provider: 'openai', multi3Step: 'improve' }),
    version('old-final', 25, 'adjust', {
      multi3Provider: 'openai', multi3Step: 'finalize', multi3SessionId: 'old-session',
    }),
    version('openai-final', 26, 'adjust', {
      multi3Provider: 'openai', multi3Step: 'finalize', multi3SessionId: 'latest-session',
    }),
    version('judge', 28, 'improve', {
      multi3Provider: 'gemini', multi3Role: 'judge-final', multi3SessionId: 'latest-session',
    }, true),
  ];

  const groups = chapterVersionSelectorGroups(versions, 'judge');

  assert.equal(groups.hasMulti3Finals, true);
  assert.deepEqual(groups.primary.map((item) => item.id), ['judge', 'openai-final']);
  assert.deepEqual(groups.secondary.map((item) => item.id), ['old-final', 'improve', 'translate', 'original']);
});

test('mantém o comportamento completo quando ainda não existe /todos', () => {
  const groups = chapterVersionSelectorGroups([
    version('original', 1, 'upload'),
    version('adjusted', 2, 'adjust', undefined, true),
  ], 'adjusted');

  assert.equal(groups.hasMulti3Finals, false);
  assert.deepEqual(groups.primary.map((item) => item.id), ['adjusted', 'original']);
  assert.deepEqual(groups.secondary, []);
});
