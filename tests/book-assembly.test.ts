import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import JSZip from 'jszip';
import { Document, Packer, Paragraph } from 'docx';
import {
  buildChapterDigest,
  chunkBookParagraphs,
  constrainSuggestions,
  introducesObviousSpanish,
} from '../lib/book-assembly/document';
import {
  parseBookSuggestions,
  parseChapterSummary,
  parseEditorialPlan,
} from '../lib/book-assembly/parsers';
import {
  analysisProgress,
  finalizationProgress,
  harmonizationProgress,
} from '../lib/book-assembly/progress';
import { buildChapterHarmonizationPrompt } from '../lib/book-assembly/prompts';
import { isMissingBookAssemblyTable } from '../lib/book-assembly/schema';
import { mergePreparedChapterBuffers } from '../lib/thesis/document-merger';
import { applySuggestionsToDocx } from '../lib/translation/docx-translator';
import type { BookEditorialPlan, BookSuggestion } from '../lib/book-assembly/types';

const paragraphs = Array.from({ length: 30 }, (_, index) => ({
  index,
  text: index === 0 ? 'Capítulo inicial' : `Parágrafo técnico número ${index} com conteúdo relevante.`,
  isHeader: index === 0,
}));

test('builds a representative bounded digest and chunks without losing paragraphs', () => {
  const digest = buildChapterDigest(paragraphs, 1800);
  assert.match(digest, /\[\[P0\]\] Capítulo inicial/);
  assert.match(digest, /\[\[P29\]\]/);
  assert.ok(digest.length <= 1800);

  const chunks = chunkBookParagraphs(paragraphs, 320);
  assert.ok(chunks.length > 1);
  assert.deepEqual(chunks.flat().map((paragraph) => paragraph.index), paragraphs.map((paragraph) => paragraph.index));
});

test('parses fenced summaries and preserves chapter identity', () => {
  const summary = parseChapterSummary(
    '```json\n{"role":"Base histórica","summary":"Expõe a formação do tema.","openingFocus":"origem","endingFocus":"mudança","keyConcepts":["offshore"]}\n```',
    { chapterId: 'c1', title: 'História', order: 1 }
  );
  assert.equal(summary.chapterId, 'c1');
  assert.equal(summary.role, 'Base histórica');
  assert.deepEqual(summary.keyConcepts, ['offshore']);
});

test('parses an editorial plan and keeps summaries as its stable context', () => {
  const summaries = [parseChapterSummary('{"summary":"Resumo"}', {
    chapterId: 'c1', title: 'Um', order: 1,
  })];
  const plan = parseEditorialPlan(JSON.stringify({
    overview: 'A obra é coesa.',
    centralThesis: 'Tese central.',
    proposedStructure: 'Progressão histórica.',
    terminology: [{ preferred: 'centro offshore', avoid: ['paraíso perfeito'], note: 'padronizar' }],
    globalIssues: [{ type: 'continuity', description: 'Criar ponte.', chapters: ['c1'] }],
    chapterGuidance: [{
      chapterId: 'c1', title: 'Um', role: 'Abertura', preserve: ['argumento'],
      recommendedChanges: ['ponte'], transitionIn: '', transitionOut: 'antecipar capítulo seguinte',
    }],
    proposedAdditions: ['transição curta'],
  }), summaries);
  assert.equal(plan.chapterSummaries[0].chapterId, 'c1');
  assert.equal(plan.globalIssues[0].type, 'continuity');
  assert.equal(plan.chapterGuidance[0].transitionOut, 'antecipar capítulo seguinte');
});

test('accepts only changed body paragraphs returned by the editor', () => {
  const suggestions = parseBookSuggestions({
    response: JSON.stringify({ suggestions: [
      { paragraphIndex: 0, revisedText: 'Novo título', reason: 'troca', kind: 'structure' },
      { paragraphIndex: 1, revisedText: paragraphs[1].text, reason: 'igual', kind: 'cohesion' },
      { paragraphIndex: 2, revisedText: 'Redação revista em português brasileiro.', reason: 'ponte', kind: 'transition' },
      { paragraphIndex: 2, revisedText: 'Duplicada', reason: 'duplicada', kind: 'cohesion' },
    ] }),
    chapterId: 'c1',
    chapterTitle: 'Capítulo',
    paragraphs,
  });
  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].paragraphIndex, 2);
  assert.equal(suggestions[0].kind, 'transition');
});

test('rejects newly introduced Spanish and caps conservative rewrites', () => {
  assert.equal(introducesObviousSpanish('a inclusão neste capítulo', 'a inclusión neste capítulo'), true);
  assert.equal(introducesObviousSpanish('a inclusión citada', 'a inclusión citada'), false);

  const suggestions: BookSuggestion[] = Array.from({ length: 10 }, (_, index) => ({
    id: `c1:p-${index}`,
    chapterId: 'c1',
    chapterTitle: 'Capítulo',
    paragraphIndex: index,
    occurrenceIndex: 0,
    originalText: `Texto ${index}`,
    improvedText: index === 0 ? 'Nueva información' : `Texto revisto ${index}`,
    reason: 'Coesão',
    kind: 'cohesion',
  }));
  const result = constrainSuggestions(suggestions, 20, 'harmonize');
  assert.equal(result.accepted.length, 5);
  assert.ok(result.warnings.some((warning) => /espanhol/i.test(warning)));
  assert.ok(result.warnings.some((warning) => /modo conservador/i.test(warning)));
});

test('progress ranges remain monotonic across editorial phases', () => {
  assert.ok(analysisProgress(2, 4) < harmonizationProgress(1, 4));
  assert.ok(harmonizationProgress(4, 4) < finalizationProgress(1, 4));
  assert.equal(finalizationProgress(4, 4), 96);
});

test('recognizes missing book assembly schema errors from Postgres and PostgREST', () => {
  assert.equal(isMissingBookAssemblyTable({ code: '42P01', message: 'relation does not exist' }), true);
  assert.equal(isMissingBookAssemblyTable({ code: 'PGRST205', message: "Could not find the table 'public.book_assembly_jobs' in the schema cache" }), true);
  assert.equal(isMissingBookAssemblyTable({ code: '42501', message: 'permission denied' }), false);
});

test('harmonization prompt explicitly preserves good pt-BR text', () => {
  const plan: BookEditorialPlan = {
    overview: 'Obra consistente', centralThesis: 'Tese', proposedStructure: 'Ordem',
    terminology: [], globalIssues: [], chapterGuidance: [], proposedAdditions: [],
    chapterSummaries: [],
  };
  const prompt = buildChapterHarmonizationPrompt({
    mode: 'harmonize', title: 'Capítulo', chapterId: 'c1', chapterOrder: 1,
    chunkNumber: 1, totalChunks: 1, paragraphs: '[[P1]] Texto bom.', plan,
    customInstructions: '',
  });
  assert.match(prompt, /já está bem redigida em português brasileiro/i);
  assert.match(prompt, /preserve pelo menos 80% dos parágrafos/i);
  assert.match(prompt, /não invente fatos/i);
});

test('merges approved chapter buffers in the author-selected order', async () => {
  const makeDocx = (text: string) => Packer.toBuffer(new Document({
    sections: [{ children: [new Paragraph(text)] }],
  }));
  const first = await makeDocx('CAPÍTULO ESCOLHIDO PRIMEIRO');
  const second = await makeDocx('CAPÍTULO ESCOLHIDO DEPOIS');
  const merged = await mergePreparedChapterBuffers([first, second]);
  const zip = await JSZip.loadAsync(merged);
  const xml = await zip.file('word/document.xml')!.async('string');

  assert.ok(xml.indexOf('CAPÍTULO ESCOLHIDO PRIMEIRO') >= 0);
  assert.ok(xml.indexOf('CAPÍTULO ESCOLHIDO DEPOIS') > xml.indexOf('CAPÍTULO ESCOLHIDO PRIMEIRO'));
});

test('applies an approved rewrite to the intended repeated paragraph occurrence', async () => {
  const inputPath = path.join(os.tmpdir(), `${randomUUID()}_book_repeat_input.docx`);
  const outputPath = path.join(os.tmpdir(), `${randomUUID()}_book_repeat_output.docx`);
  try {
    const source = await Packer.toBuffer(new Document({
      sections: [{ children: [
        new Paragraph('PARAGRAFO REPETIDO'),
        new Paragraph('INTERMEDIARIO'),
        new Paragraph('PARAGRAFO REPETIDO'),
      ] }],
    }));
    await fs.writeFile(inputPath, source);
    const result = await applySuggestionsToDocx(inputPath, outputPath, [{
      originalText: 'PARAGRAFO REPETIDO',
      improvedText: 'SEGUNDA OCORRENCIA REVISTA',
      occurrenceIndex: 1,
    }]);
    assert.deepEqual(result, { appliedCount: 1, unmatchedCount: 0 });

    const zip = await JSZip.loadAsync(await fs.readFile(outputPath));
    const xml = await zip.file('word/document.xml')!.async('string');
    assert.ok(xml.indexOf('PARAGRAFO REPETIDO') < xml.indexOf('INTERMEDIARIO'));
    assert.ok(xml.indexOf('SEGUNDA OCORRENCIA REVISTA') > xml.indexOf('INTERMEDIARIO'));
  } finally {
    await fs.unlink(inputPath).catch(() => undefined);
    await fs.unlink(outputPath).catch(() => undefined);
  }
});
