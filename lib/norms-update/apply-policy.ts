import type { NormUpdateApplyResult } from './apply-docx';

export type NormApplicationSummary = {
  requestedSuggestions: number;
  appliedSuggestions: number;
  unmatchedSuggestions: number;
  changedParagraphs: number;
  unmatchedReferenceIds: string[];
  unmatchedReferences: Array<{
    referenceId: string;
    paragraphIndex: number;
    reason: 'missing-suggested-text' | 'text-not-found' | 'invalid-xml';
  }>;
};

export function hasApplicableNormUpdates(result: NormUpdateApplyResult): boolean {
  return result.appliedCount > 0;
}

export function buildNormApplicationSummary(
  result: NormUpdateApplyResult
): NormApplicationSummary {
  return {
    requestedSuggestions: result.totalCount,
    appliedSuggestions: result.appliedCount,
    unmatchedSuggestions: result.failures.length,
    changedParagraphs: result.changedParagraphIndexes.length,
    unmatchedReferenceIds: result.failures.map((failure) => failure.referenceId),
    unmatchedReferences: result.failures.map((failure) => ({ ...failure })),
  };
}
