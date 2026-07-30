import assert from 'node:assert/strict';
import test from 'node:test';
import { computeVersionDiff } from '@/lib/thesis/version-diff';

test('counts a rewritten paragraph once and exposes inline changes', () => {
  const result = computeVersionDiff(
    'Primeiro parágrafo.\n\nAndorra é um principado.\n\nÚltimo parágrafo.',
    'Primeiro parágrafo.\n\nAndorra é um microestado soberano.\n\nÚltimo parágrafo.'
  );

  assert.equal(result.changedParagraphs, 1);
  assert.equal(result.insertedParagraphs, 0);
  assert.equal(result.removedParagraphs, 0);
  assert.equal(result.totalChangeRows, 1);

  const changed = result.rows.find(row => row.type === 'changed');
  assert.ok(changed);
  assert.ok(changed.leftSegments?.some(segment => segment.type === 'removed'));
  assert.ok(changed.rightSegments?.some(segment => segment.type === 'added'));
});

test('keeps genuine insertions separate from rewritten paragraphs', () => {
  const result = computeVersionDiff(
    'Primeiro parágrafo.\n\nÚltimo parágrafo.',
    'Primeiro parágrafo.\n\nParágrafo novo.\n\nÚltimo parágrafo.'
  );

  assert.equal(result.changedParagraphs, 0);
  assert.equal(result.insertedParagraphs, 1);
  assert.equal(result.removedParagraphs, 0);
  assert.equal(result.totalChangeRows, 1);
});

test('aligns a mixed change block into paired comparison rows', () => {
  const result = computeVersionDiff(
    'Mantido.\n\nTexto antigo A.\n\nTexto antigo B.\n\nFinal.',
    'Mantido.\n\nTexto novo A.\n\nFinal.'
  );

  assert.equal(result.changedParagraphs, 1);
  assert.equal(result.removedParagraphs, 1);
  assert.equal(result.insertedParagraphs, 0);
  assert.deepEqual(
    result.rows.filter(row => row.type !== 'equal').map(row => row.changeIndex),
    [0, 1]
  );
});
