import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_COMMAND_PROMPTS,
  normalizeCommandPromptOverrides,
  renderBookAdjustInstructions,
  resolveCommandPrompt,
} from '../lib/book-workflow/prompts';

test('usa o padrão quando não existe personalização e o override quando foi salvo', () => {
  assert.equal(resolveCommandPrompt('review', {}), DEFAULT_COMMAND_PROMPTS.review);
  assert.equal(
    resolveCommandPrompt('review', { review: '  Minha revisão personalizada  ' }),
    'Minha revisão personalizada'
  );
});

test('normaliza somente chaves conhecidas e prompts não vazios', () => {
  assert.deepEqual(normalizeCommandPromptOverrides({
    translate: ' Traduzir desta forma ',
    review: '   ',
    desconhecido: 'ignorar',
    improve: 123,
  }), {
    translate: 'Traduzir desta forma',
  });
});

test('/ajustar injeta a instrução do autor sem perder a moldura configurada', () => {
  const rendered = renderBookAdjustInstructions(
    'Antes\n{{instrucoes_autor}}\nDepois\n{{instrucoes_autor}}',
    '  reduzir a conclusão  '
  );

  assert.equal(
    rendered,
    'Antes\nreduzir a conclusão\nDepois\nreduzir a conclusão'
  );
});

test('/ajustar acrescenta a instrução quando o editor remove o marcador', () => {
  const rendered = renderBookAdjustInstructions('Moldura personalizada', 'corrigir o título');
  assert.match(rendered, /Moldura personalizada/);
  assert.match(rendered, /INSTRUÇÃO DO AUTOR\ncorrigir o título/);
});
