import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildNormApplicationSummary,
  hasApplicableNormUpdates,
} from '../lib/norms-update/apply-policy';
import type { NormUpdateApplyResult } from '../lib/norms-update/apply-docx';

function result(overrides: Partial<NormUpdateApplyResult>): NormUpdateApplyResult {
  return {
    appliedCount: 0,
    totalCount: 2,
    appliedReferenceIds: [],
    failures: [],
    changedParagraphIndexes: [],
    ...overrides,
  };
}

test('creates an output when at least one selected suggestion was applied', () => {
  const partial = result({
    appliedCount: 1,
    appliedReferenceIds: ['ok'],
    failures: [{ referenceId: 'missing', paragraphIndex: 4, reason: 'text-not-found' }],
    changedParagraphIndexes: [3],
  });

  assert.equal(hasApplicableNormUpdates(partial), true);
  assert.deepEqual(buildNormApplicationSummary(partial), {
    requestedSuggestions: 2,
    appliedSuggestions: 1,
    unmatchedSuggestions: 1,
    changedParagraphs: 1,
    unmatchedReferenceIds: ['missing'],
    unmatchedReferences: [
      { referenceId: 'missing', paragraphIndex: 4, reason: 'text-not-found' },
    ],
  });
});

test('blocks output only when none of the selected suggestions were applied', () => {
  const none = result({
    failures: [
      { referenceId: 'a', paragraphIndex: 1, reason: 'text-not-found' },
      { referenceId: 'b', paragraphIndex: 2, reason: 'text-not-found' },
    ],
  });

  assert.equal(hasApplicableNormUpdates(none), false);
});
