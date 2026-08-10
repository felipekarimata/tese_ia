import assert from 'node:assert/strict';
import test from 'node:test';
import type { CurrentnessFinding } from '../lib/currentness-review';
import {
  runTodosCurrentnessReviewStep,
  type TodosCurrentnessReviewDependencies,
  type TodosCurrentnessProgress,
} from '../lib/todos/currentness-review-step';

function currentnessFinding(overrides: Partial<CurrentnessFinding> = {}): CurrentnessFinding {
  return {
    id: 'finding-1',
    type: 'outro',
    number: 'factual',
    fullText: 'O dado econômico utilizado no texto era de 2020.',
    context: 'Capítulo 1',
    paragraphIndex: 1,
    status: 'substituida',
    updateDescription: 'Há evidência oficial mais recente.',
    updateType: 'auto',
    suggestedText: 'O dado econômico foi atualizado com a série oficial de 2025.',
    evidence: [{
      id: 'S1',
      title: 'Fonte oficial',
      url: 'https://example.gov.br/dados',
      domain: 'example.gov.br',
      sourceType: 'official',
    }],
    sourceIds: ['S1'],
    researchQueries: ['dado econômico série oficial 2025'],
    confidence: 0.95,
    reviewScope: 'currentness',
    category: 'factual',
    verdict: 'new_evidence',
    ...overrides,
  };
}

const extractedDocument = {
  structure: {
    sections: [{
      title: 'Capítulo 1',
      level: 1,
      startParagraphIndex: 0,
      endParagraphIndex: 1,
      paragraphCount: 2,
    }],
    totalParagraphs: 2,
    totalChapters: 1,
  },
  paragraphs: [
    { text: 'Capítulo 1', isHeader: true, headerLevel: 1, index: 0 },
    { text: 'O dado econômico utilizado no texto era de 2020.', isHeader: false, index: 1 },
  ],
};

test('/todos usa revisão currentness profunda e aplica somente achados com texto sugerido', async () => {
  const progress: TodosCurrentnessProgress[] = [];
  let receivedDepth = '';
  let receivedProvider = '';
  let appliedIds: string[] = [];
  let copied = false;

  const applicable = currentnessFinding();
  const uncertain = currentnessFinding({
    id: 'finding-2',
    verdict: 'uncertain',
    updateType: 'manual',
    suggestedText: undefined,
  });

  const dependencies: TodosCurrentnessReviewDependencies = {
    extractDocument: async (path) => {
      assert.equal(path, 'input.docx');
      return extractedDocument;
    },
    reviewDocument: async (options) => {
      receivedDepth = options.depth || '';
      receivedProvider = options.provider;
      await options.onProgress?.(1, 2);
      await options.onProgress?.(2, 2);
      return [applicable, uncertain];
    },
    applyUpdates: async (inputPath, outputPath, findings) => {
      assert.equal(inputPath, 'input.docx');
      assert.equal(outputPath, 'output.docx');
      appliedIds = findings.map((finding) => finding.id);
      return {
        appliedCount: 1,
        totalCount: 1,
        appliedReferenceIds: ['finding-1'],
        failures: [],
        changedParagraphIndexes: [1],
      };
    },
    copyFile: async () => {
      copied = true;
    },
  };

  const result = await runTodosCurrentnessReviewStep({
    inputPath: 'input.docx',
    outputPath: 'output.docx',
    provider: 'openai',
    model: 'gpt-5.6-terra',
    apiKey: 'test-key',
    onProgress: (item) => {
      progress.push(item);
    },
  }, dependencies);

  assert.equal(receivedDepth, 'deep');
  assert.equal(receivedProvider, 'openai');
  assert.deepEqual(appliedIds, ['finding-1']);
  assert.equal(copied, false);
  assert.equal(result.findings.length, 2);
  assert.deepEqual(result.applicableFindings.map((finding) => finding.id), ['finding-1']);
  assert.equal(result.applyResult?.appliedCount, 1);
  assert.deepEqual(
    progress.filter((item) => item.phase === 'research').map((item) => item.current),
    [undefined, 1, 2]
  );
  assert.equal(progress.at(-1)?.phase, 'completed');
});

test('/todos preserva o documento quando a pesquisa não produz atualização aplicável', async () => {
  let copiedPaths: string[] = [];
  let applyCalled = false;

  const dependencies: TodosCurrentnessReviewDependencies = {
    extractDocument: async () => extractedDocument,
    reviewDocument: async () => [currentnessFinding({
      verdict: 'uncertain',
      updateType: 'manual',
      suggestedText: undefined,
    })],
    applyUpdates: async () => {
      applyCalled = true;
      throw new Error('não deveria aplicar');
    },
    copyFile: async (inputPath, outputPath) => {
      copiedPaths = [inputPath.toString(), outputPath.toString()];
    },
  };

  const result = await runTodosCurrentnessReviewStep({
    inputPath: 'source.docx',
    outputPath: 'reviewed.docx',
    provider: 'gemini',
    model: 'gemini-3.5-flash',
    apiKey: 'test-key',
  }, dependencies);

  assert.deepEqual(copiedPaths, ['source.docx', 'reviewed.docx']);
  assert.equal(applyCalled, false);
  assert.equal(result.applicableFindings.length, 0);
  assert.equal(result.applyResult, null);
});
