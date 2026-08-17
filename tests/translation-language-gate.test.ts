import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import JSZip from 'jszip';
import { assessPortugueseDocument } from '../lib/translation/language-gate';
import {
  buildWholeDocumentPrompt,
  processWholeDocument,
} from '../lib/document-processing/whole-document';
import { translateDocx } from '../lib/translation/docx-translator';

const ptBrParagraph = `
  A análise econômica do direito permite compreender como as instituições jurídicas influenciam
  os incentivos, os custos de transação e as decisões dos agentes. No contexto brasileiro, essa
  abordagem também ajuda a avaliar a legislação tributária, a segurança jurídica e os efeitos das
  políticas públicas. O estudo considera ainda a relação entre eficiência, distribuição de renda,
  transparência e desenvolvimento econômico, sem abandonar os limites definidos pela Constituição.
  Por essa razão, o capítulo apresenta conceitos, evidências e exemplos que podem orientar uma
  interpretação cuidadosa das estruturas internacionais e de seus impactos sobre a economia nacional.
`;

test('pula a IA quando o documento está claramente em pt-BR', () => {
  const assessment = assessPortugueseDocument([ptBrParagraph, ptBrParagraph]);

  assert.equal(assessment.shouldSkipTranslation, true);
  assert.equal(assessment.reason, 'already-portuguese');
  assert.equal(assessment.foreignParagraphCount, 0);
});

test('mantém a tradução completa quando existe parágrafo estrangeiro relevante', () => {
  const englishParagraph = `
    The international tax system has changed substantially during the last decade, and the available
    evidence shows that transparency rules are increasingly important for governments, companies and
    investors. These developments should be examined with careful attention to their legal and economic
    consequences, especially when the underlying arrangements operate across several jurisdictions.
  `;
  const assessment = assessPortugueseDocument([ptBrParagraph, ptBrParagraph, englishParagraph]);

  assert.equal(assessment.shouldSkipTranslation, false);
  assert.equal(assessment.reason, 'foreign-content-detected');
  assert.equal(assessment.foreignParagraphCount, 1);
});

test('não pula a normalização quando detecta sinais de português de Portugal', () => {
  const portugalParagraph = `${ptBrParagraph}
    O utilizador deverá consultar o ficheiro económico e verificar se o projecto está actualizado.
  `;
  const assessment = assessPortugueseDocument([portugalParagraph, ptBrParagraph]);

  assert.equal(assessment.shouldSkipTranslation, false);
  assert.equal(assessment.reason, 'portugal-portuguese-detected');
  assert.ok(assessment.portugalPortugueseSignals.length > 0);
});

test('é conservador com textos curtos ou sem confiança suficiente', () => {
  const assessment = assessPortugueseDocument(['Trust, foundation and holding company.']);

  assert.equal(assessment.shouldSkipTranslation, false);
  assert.equal(assessment.reason, 'insufficient-text');
});

test('o prompt de tradução do /todos recebe o mesmo perfil editorial de livro', () => {
  const prompt = buildWholeDocumentPrompt(
    'translate',
    '[[P0000]]Original text[[/P0000]]',
    {
      targetLanguage: 'pt',
      editorialProfile: 'book-ptbr',
      skillContext: 'todos',
      relatedContext: 'CAPÍTULO 1: terminologia tributária consolidada',
    }
  );

  assert.match(prompt, /Traduza o corpo do capítulo para português brasileiro de livro/);
  assert.match(prompt, /Notas de rodapé e notas de fim permanecem 100% no idioma original/);
  assert.match(prompt, /\[\[P0000\]\]Original text\[\[\/P0000\]\]/);
  assert.match(prompt, /<contexto_livro>/);
  assert.match(prompt, /terminologia tributária consolidada/);
  assert.match(prompt, /somente leitura/);
});

test('o fast path copia o DOCX sem fazer chamada à IA', async () => {
  const id = randomUUID();
  const inputPath = path.join(os.tmpdir(), `${id}_ptbr_input.docx`);
  const outputPath = path.join(os.tmpdir(), `${id}_ptbr_output.docx`);
  const zip = new JSZip();
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body><w:p><w:r><w:t>${ptBrParagraph.repeat(2)}</w:t></w:r></w:p></w:body>
      </w:document>`
  );
  const inputBuffer = await zip.generateAsync({ type: 'nodebuffer' });
  await fs.writeFile(inputPath, inputBuffer);

  try {
    const result = await processWholeDocument(inputPath, outputPath, {
      task: 'translate',
      provider: 'openai',
      model: 'modelo-que-nao-deve-ser-chamado',
      targetLanguage: 'pt',
      skillContext: 'todos',
      editorialProfile: 'book-ptbr',
    });

    assert.equal(result.success, true);
    assert.equal(result.skippedAlreadyTargetLanguage, true);
    assert.deepEqual(await fs.readFile(outputPath), inputBuffer);
  } finally {
    await fs.unlink(inputPath).catch(() => {});
    await fs.unlink(outputPath).catch(() => {});
  }
});

test('o fallback por lotes também pula a IA e preserva as notas', async () => {
  const id = randomUUID();
  const inputPath = path.join(os.tmpdir(), `${id}_batch_input.docx`);
  const outputPath = path.join(os.tmpdir(), `${id}_batch_output.docx`);
  const zip = new JSZip();
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body><w:p><w:r><w:t>${ptBrParagraph.repeat(2)}</w:t></w:r></w:p></w:body>
      </w:document>`
  );
  zip.file(
    'word/footnotes.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <w:footnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:footnote w:id="1"><w:p><w:r><w:t>The original footnote must remain unchanged.</w:t></w:r></w:p></w:footnote>
      </w:footnotes>`
  );
  const inputBuffer = await zip.generateAsync({ type: 'nodebuffer' });
  await fs.writeFile(inputPath, inputBuffer);

  try {
    const result = await translateDocx(inputPath, outputPath, {
      targetLanguage: 'pt',
      provider: 'openai',
      model: 'modelo-que-nao-deve-ser-chamado',
      preserveNotes: true,
      editorialProfile: 'book-ptbr',
    });

    assert.equal(result.success, true);
    assert.equal(result.skippedAlreadyTargetLanguage, true);
    assert.deepEqual(await fs.readFile(outputPath), inputBuffer);
  } finally {
    await fs.unlink(inputPath).catch(() => {});
    await fs.unlink(outputPath).catch(() => {});
  }
});
