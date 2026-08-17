import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildJudgeEditorBatches,
  parseJudgeEditorParagraphs,
  replaceJudgeFinalCandidate,
  sourceMulti3Candidates,
  synthesizeJudgeFinalDocument,
  type JudgeEditorParagraph,
} from '../lib/multi-ai/judge-editor';
import type { Multi3Candidate } from '../lib/multi-ai/types';

const paragraph = (
  paragraphIndex: number,
  variants: JudgeEditorParagraph['variants']
): JudgeEditorParagraph => ({
  paragraphIndex,
  isHeader: false,
  baseText: variants[0]?.text || '',
  variants,
});

test('divide a redação final por quantidade e volume de texto', () => {
  const variants = [{ provider: 'openai' as const, model: 'gpt', text: '12345' }];
  const batches = buildJudgeEditorBatches(
    [paragraph(0, variants), paragraph(1, variants), paragraph(2, variants)],
    2,
    9
  );

  assert.deepEqual(batches.map((batch) => batch.map((item) => item.paragraphIndex)), [[0], [1], [2]]);
});

test('aceita somente parágrafos válidos devolvidos pelo redator', () => {
  const batch = [paragraph(4, [{ provider: 'gemini', model: 'gemini-test', text: 'Base' }])];
  const parsed = parseJudgeEditorParagraphs(JSON.stringify({
    paragraphs: [
      { paragraphIndex: 4, finalText: 'Texto final' },
      { paragraphIndex: 99, finalText: 'Índice inventado' },
      { paragraphIndex: 4, finalText: '' },
    ],
  }), batch);

  assert.equal(parsed.size, 1);
  assert.equal(parsed.get(4), 'Texto final');
});

test('mantém os três candidatos e substitui apenas a redação final anterior', () => {
  const candidates: Multi3Candidate[] = [
    { provider: 'openai', model: 'gpt', status: 'completed', branchIndex: 0 },
    { provider: 'gemini', model: 'gemini', status: 'completed', branchIndex: 1 },
    { provider: 'anthropic', model: 'claude', status: 'completed', branchIndex: 2 },
    { provider: 'gemini', model: 'judge-old', status: 'completed', branchIndex: 3, role: 'judge-final' },
  ];
  const next = replaceJudgeFinalCandidate(candidates, {
    provider: 'openai',
    model: 'judge-new',
    status: 'running',
    branchIndex: 3,
    role: 'judge-final',
  });

  assert.equal(sourceMulti3Candidates(next).length, 3);
  assert.equal(next.length, 4);
  assert.equal(next.at(-1)?.model, 'judge-new');
});

test('cria um DOCX final a partir do conteúdo integral de todos os candidatos', async () => {
  const documents: Record<string, any> = {
    'openai.docx': {
      structure: {},
      paragraphs: [
        { index: 0, text: 'Título', isHeader: true, headerLevel: 1 },
        { index: 1, text: 'Versão OpenAI.', isHeader: false },
      ],
    },
    'gemini.docx': {
      structure: {},
      paragraphs: [
        { index: 0, text: 'Título acadêmico completo', isHeader: true, headerLevel: 1 },
        { index: 1, text: 'Versão Gemini mais longa e detalhada.', isHeader: false },
      ],
    },
    'claude.docx': {
      structure: {},
      paragraphs: [
        { index: 0, text: 'Título', isHeader: true, headerLevel: 1 },
        { index: 1, text: 'Versão Claude.', isHeader: false },
      ],
    },
    'final.docx': {
      structure: {},
      paragraphs: [
        { index: 0, text: 'Título final', isHeader: true, headerLevel: 1 },
        { index: 1, text: 'Síntese das melhores partes.', isHeader: false },
      ],
    },
  };
  let generatedPrompt = '';
  let generateCalls = 0;
  let appliedInput = '';
  let appliedSuggestions: Array<{ originalText: string; improvedText: string }> = [];

  const result = await synthesizeJudgeFinalDocument({
    candidates: [
      { provider: 'openai', model: 'gpt-test', filePath: 'openai.docx' },
      { provider: 'gemini', model: 'gemini-test', filePath: 'gemini.docx' },
      { provider: 'anthropic', model: 'claude-test', filePath: 'claude.docx' },
    ],
    outputPath: 'final.docx',
    judgeProvider: 'gemini',
    judgeModel: 'judge-test',
    apiKey: 'test-key',
    bookContext: 'CAPÍTULO 1: conceitos já explicados anteriormente.',
  }, {
    extractDocument: async (filePath: string) => documents[filePath],
    generateJson: async (params: any) => {
      generateCalls++;
      generatedPrompt = params.prompt;
      return JSON.stringify({
        paragraphs: generateCalls === 1
          ? [{ paragraphIndex: 0, finalText: 'Título final' }]
          : [{ paragraphIndex: 1, finalText: 'Síntese das melhores partes.' }],
      });
    },
    applySuggestions: async (inputPath: string, _outputPath: string, suggestions: any[]) => {
      appliedInput = inputPath;
      appliedSuggestions = suggestions;
      return { appliedCount: suggestions.length, unmatchedCount: 0 };
    },
    copyFile: async () => undefined,
  } as any);

  assert.match(generatedPrompt, /Versão OpenAI/);
  assert.match(generatedPrompt, /Versão Gemini/);
  assert.match(generatedPrompt, /Versão Claude/);
  assert.match(generatedPrompt, /já está bem redigido em português brasileiro/);
  assert.match(generatedPrompt, /Não retraduza palavras/);
  assert.match(generatedPrompt, /<contexto_livro>/);
  assert.match(generatedPrompt, /conceitos já explicados anteriormente/);
  assert.equal(appliedInput, 'gemini.docx');
  assert.equal(appliedSuggestions.length, 2);
  assert.equal(generateCalls, 2);
  assert.equal(result.baseProvider, 'gemini');
  assert.equal(result.synthesizedParagraphCount, 2);
  assert.match(result.reasoning, /sem eleger um único candidato/);
});
