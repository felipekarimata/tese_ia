import test from 'node:test';
import assert from 'node:assert/strict';
import { multi3OverallProgress, stageOverallProgress } from '../lib/multi-ai/progress';
import { formatMulti3ProgressLine } from '../lib/multi-ai/errors';
import type { Multi3Candidate } from '../lib/multi-ai/types';

const candidates: Multi3Candidate[] = [
  {
    provider: 'openai',
    model: 'gpt-5.6-terra',
    status: 'running',
    progress: 30,
    progressLabel: 'Revisando vigência, fatos e dados',
    stage: 'review',
  },
  {
    provider: 'gemini',
    model: 'gemini-3.5-flash',
    status: 'running',
    progress: 55,
    progressLabel: 'Aprimorando conteúdo e fontes',
    stage: 'improve',
  },
  {
    provider: 'anthropic',
    model: 'claude-opus-5',
    status: 'running',
    progress: 78,
    progressLabel: 'Finalizando coesão editorial',
    stage: 'finalize',
  },
];

test('maps progress inside each /todos stage to candidate progress', () => {
  assert.equal(stageOverallProgress('translate', 0), 5);
  assert.equal(stageOverallProgress('translate', 100), 30);
  assert.equal(stageOverallProgress('review', 50), 43);
  assert.equal(stageOverallProgress('finalize', 100), 99);
});

test('combines three parallel candidates and reserves the final 10% for the judge', () => {
  assert.equal(multi3OverallProgress({ status: 'processing', candidates }), 49);
  assert.equal(multi3OverallProgress({ status: 'judging', candidates }), 95);
  assert.equal(multi3OverallProgress({ status: 'accepted', candidates }), 100);
});

test('tracks the fourth judge-final artifact without diluting the three candidate branches', () => {
  const completed = candidates.map((candidate) => ({ ...candidate, status: 'completed' as const, progress: 100 }));
  const withFinalEditor: Multi3Candidate[] = [
    ...completed,
    {
      provider: 'gemini',
      model: 'gemini-3.5-flash',
      role: 'judge-final',
      status: 'running',
      branchIndex: 3,
      progress: 10,
      progressLabel: 'Redigindo a versão final',
      currentBatch: 1,
      totalBatches: 10,
    },
  ];

  assert.equal(multi3OverallProgress({ status: 'judging', candidates: withFinalEditor }), 91);
  assert.match(formatMulti3ProgressLine({
    status: 'judging',
    command: '/todos',
    providers: ['openai', 'gemini', 'anthropic'],
    candidates: withFinalEditor,
  }), /Redigindo a versão final, lote 1\/10/);
});

test('progress message exposes the overall percentage and active model details', () => {
  const line = formatMulti3ProgressLine({
    status: 'processing',
    command: '/todos',
    providers: ['openai', 'gemini', 'anthropic'],
    candidates,
  });

  assert.match(line, /49%/);
  assert.match(line, /openai:/);
  assert.match(line, /gemini:/);
  assert.match(line, /anthropic:/);
});
