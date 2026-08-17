import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildBudgetedBookContext,
  extractBookContextTerms,
  formatBookContextForPrompt,
  type LoadedBookContextChapter,
} from '../lib/books/context';

function chapter(
  chapterId: string,
  chapterOrder: number,
  chapterTitle: string,
  chunks: string[]
): LoadedBookContextChapter {
  return {
    chapterId,
    chapterOrder,
    chapterTitle,
    currentVersionId: `version-${chapterId}`,
    chunks: chunks.map((text, index) => ({ index, text })),
  };
}

test('extractBookContextTerms normalizes accents and removes generic words', () => {
  const terms = extractBookContextTerms('Como manter coerência tributária entre capítulos e coerência conceitual?');
  assert.equal(terms[0], 'coerencia');
  assert.ok(terms.includes('tributaria'));
  assert.ok(terms.includes('conceitual'));
  assert.ok(!terms.includes('como'));
  assert.ok(!terms.includes('entre'));
});

test('book context excludes the active chapter and follows the configured book order', () => {
  const result = buildBudgetedBookContext({
    bookTitle: 'Economia Offshore',
    currentChapterId: 'current',
    chapters: [
      chapter('later', 3, 'Conclusão', ['Terceiro capítulo.']),
      chapter('current', 2, 'Capítulo atual', ['Nunca deve aparecer.']),
      chapter('first', 1, 'Fundamentos', ['Primeiro capítulo.']),
    ],
  });

  assert.deepEqual(result.includedChapterIds, ['first', 'later']);
  assert.ok(!result.text.includes('Nunca deve aparecer'));
  assert.ok(result.text.indexOf('Fundamentos') < result.text.indexOf('Conclusão'));
});

test('book context stays within budget and prioritizes chunks related to the current task', () => {
  const filler = (word: string) => `${word} `.repeat(900);
  const result = buildBudgetedBookContext({
    bookTitle: 'Livro extenso',
    currentChapterId: 'current',
    query: 'tributação territorial e centros offshore',
    maxChars: 2_400,
    chapters: [
      chapter('sibling', 1, 'Fundamentos', [
        'Abertura conceitual breve.',
        filler('conteúdo-sem-relação'),
        `A tributação territorial dos centros offshore exige coerência. ${filler('tributação')}`,
      ]),
    ],
  });

  assert.ok(result.text.length <= 2_400);
  assert.ok(result.text.includes('Abertura conceitual breve'));
  assert.ok(result.text.includes('tributação territorial'));
  assert.equal(result.truncated, true);
});

test('formatted context is clearly delimited and read-only', () => {
  const formatted = formatBookContextForPrompt('CAPÍTULO 1: Referência');
  assert.ok(formatted.includes('somente leitura'));
  assert.ok(formatted.includes('<contexto_livro>'));
  assert.ok(formatted.includes('</contexto_livro>'));
  assert.equal(formatBookContextForPrompt(formatted), formatted);
  assert.equal(formatBookContextForPrompt(null), '');
});
