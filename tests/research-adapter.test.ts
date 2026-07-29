import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeHttpUrl,
  normalizeSources,
  parseAnthropicResearchContent,
  parseGeminiGrounding,
  parseResponsesApi
} from '../lib/ai/research/index';
import { buildReviewSegments } from '../lib/currentness-review';

test('normaliza, deduplica e rejeita URLs não HTTP', () => {
  assert.equal(normalizeHttpUrl('javascript:alert(1)'), undefined);
  assert.equal(normalizeHttpUrl('not-a-url'), undefined);
  const sources = normalizeSources([
    { title: 'Planalto', url: 'https://www.planalto.gov.br/lei#artigo' },
    { title: 'Planalto atualizado', url: 'https://www.planalto.gov.br/lei' },
    { title: 'Inválida', url: 'file:///etc/passwd' }
  ]);
  assert.equal(sources.length, 1);
  assert.equal(sources[0].id, 'S1');
  assert.equal(sources[0].sourceType, 'official');
  assert.equal(sources[0].title, 'Planalto atualizado');
});

test('preserva consultas e todas as fontes da Responses API', () => {
  const parsed = parseResponsesApi({
    output_text: 'Síntese fundamentada.',
    output: [
      {
        type: 'web_search_call',
        action: {
          query: 'estado atual da lei',
          sources: [
            { title: 'Senado', url: 'https://www12.senado.leg.br/noticias' },
            { title: 'URL falsa', url: 'not-a-url' }
          ]
        }
      },
      {
        type: 'message',
        content: [{
          text: 'Síntese fundamentada.',
          annotations: [{ type: 'url_citation', title: 'LexML', url: 'https://www.lexml.gov.br/' }]
        }]
      }
    ]
  });
  assert.equal(parsed.text, 'Síntese fundamentada.');
  assert.deepEqual(parsed.queries, ['estado atual da lei']);
  assert.equal(parsed.sources.length, 2);
  assert.equal(parsed.searchCalls, 1);
});

test('extrai grounding do Gemini sem aceitar URLs inventadas', () => {
  const parsed = parseGeminiGrounding({
    text: 'Resultado.',
    candidates: [{
      groundingMetadata: {
        webSearchQueries: ['consulta A', 'consulta A'],
        groundingChunks: [
          { web: { title: 'SciELO', uri: 'https://www.scielo.br/journal' } },
          { web: { title: 'Inválida', uri: 'gemini://citation' } }
        ]
      }
    }]
  });
  assert.deepEqual(parsed.queries, ['consulta A']);
  assert.equal(parsed.sources.length, 1);
  assert.equal(parsed.sources[0].sourceType, 'academic');
});

test('extrai pesquisas e citações do Anthropic', () => {
  const parsed = parseAnthropicResearchContent([
    { type: 'server_tool_use', name: 'web_search', input: { query: 'artigos recentes' } },
    {
      type: 'web_search_tool_result',
      content: [{ title: 'Artigo', url: 'https://doi.org/10.1000/test', page_content: 'Resumo' }]
    },
    {
      type: 'text',
      text: 'Síntese.',
      citations: [{ title: 'Artigo', url: 'https://doi.org/10.1000/test', cited_text: 'Trecho' }]
    }
  ]);
  assert.equal(parsed.text, 'Síntese.');
  assert.deepEqual(parsed.queries, ['artigos recentes']);
  assert.equal(parsed.sources.length, 1);
  assert.equal(parsed.sources[0].sourceType, 'academic');
  assert.equal(parsed.searchCalls, 1);
});

test('divide o documento para /revisar preservando índices e secções', () => {
  const paragraphs = [
    { text: 'Capítulo 1', isHeader: true, headerLevel: 1, index: 0 },
    { text: 'A'.repeat(180), isHeader: false, index: 1 },
    { text: 'B'.repeat(180), isHeader: false, index: 2 },
    { text: 'Capítulo 2', isHeader: true, headerLevel: 1, index: 3 },
    { text: 'C'.repeat(180), isHeader: false, index: 4 }
  ];
  const segments = buildReviewSegments(paragraphs, [
    { title: 'Capítulo 1', startParagraphIndex: 0, endParagraphIndex: 2 },
    { title: 'Capítulo 2', startParagraphIndex: 3, endParagraphIndex: 4 }
  ], 400);

  assert.equal(segments.length, 2);
  assert.deepEqual(segments[0].paragraphs.map(paragraph => paragraph.index), [1, 2]);
  assert.deepEqual(segments[1].paragraphs.map(paragraph => paragraph.index), [4]);
  assert.ok(!segments.some(segment => segment.text.includes('Capítulo 1')));
});
