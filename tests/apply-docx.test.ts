import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import JSZip from 'jszip';
import { parseStringPromise } from 'xml2js';
import { applyNormUpdatesToDocx } from '@/lib/norms-update/apply-docx';
import type { NormReference } from '@/lib/norms-update/types';

const DOCUMENT_PREFIX = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>';
const DOCUMENT_SUFFIX = '<w:sectPr/></w:body></w:document>';

async function createDocx(filePath: string, documentBody: string): Promise<void> {
  const zip = new JSZip();
  zip.file('word/document.xml', `${DOCUMENT_PREFIX}${documentBody}${DOCUMENT_SUFFIX}`);
  await fs.writeFile(filePath, await zip.generateAsync({ type: 'nodebuffer' }));
}

async function readDocumentXml(filePath: string): Promise<string> {
  const zip = await JSZip.loadAsync(await fs.readFile(filePath));
  const file = zip.file('word/document.xml');
  assert.ok(file);
  return file.async('string');
}

function reference(overrides: Partial<NormReference> = {}): NormReference {
  return {
    id: 'finding-1',
    type: 'outro',
    number: 'factual',
    fullText: 'Andorra é um pequeno principado situado nos Pireneus.',
    context: 'Andorra',
    paragraphIndex: 0,
    suggestedText: 'Andorra é um microestado soberano situado nos Pireneus.',
    ...overrides
  };
}

test('applies a whole-paragraph suggestion split across Word text runs', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'autoria-apply-'));
  const inputPath = path.join(directory, 'input.docx');
  const outputPath = path.join(directory, 'output.docx');

  try {
    await createDocx(
      inputPath,
      '<w:p><w:r><w:t xml:space="preserve">Andorra é um pequeno </w:t></w:r><w:r><w:rPr><w:i/></w:rPr><w:t>principado situado nos Pireneus.</w:t></w:r></w:p>'
    );

    const result = await applyNormUpdatesToDocx(inputPath, outputPath, [reference()]);
    const xml = await readDocumentXml(outputPath);

    assert.equal(result.appliedCount, 1);
    assert.equal(result.failures.length, 0);
    assert.deepEqual(result.changedParagraphIndexes, [0]);
    assert.match(xml, /Andorra é um microestado soberano situado nos Pireneus\./);
    assert.doesNotMatch(xml, /pequeno/);
    assert.match(xml, /<w:rPr><w:i\/><\/w:rPr>/);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('replaces a reference across runs while preserving surrounding text', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'autoria-apply-'));
  const inputPath = path.join(directory, 'input.docx');
  const outputPath = path.join(directory, 'output.docx');

  try {
    await createDocx(
      inputPath,
      '<w:p><w:r><w:t xml:space="preserve">Segundo a Lei nº </w:t></w:r><w:r><w:t>8.078/1990</w:t></w:r><w:r><w:t xml:space="preserve">, a proteção permanece.</w:t></w:r></w:p>'
    );

    const result = await applyNormUpdatesToDocx(inputPath, outputPath, [reference({
      fullText: 'Lei nº 8.078/1990',
      suggestedText: 'Lei nº 14.181/2021'
    })]);
    const xml = await readDocumentXml(outputPath);
    const visibleText = [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
      .map(match => match[1])
      .join('');

    assert.equal(result.appliedCount, 1);
    assert.equal(visibleText, 'Segundo a Lei nº 14.181/2021, a proteção permanece.');
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('reports an unmatched suggestion instead of claiming it was applied', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'autoria-apply-'));
  const inputPath = path.join(directory, 'input.docx');
  const outputPath = path.join(directory, 'output.docx');

  try {
    await createDocx(inputPath, '<w:p><w:r><w:t>Outro conteúdo.</w:t></w:r></w:p>');

    const result = await applyNormUpdatesToDocx(inputPath, outputPath, [reference()]);

    assert.equal(result.appliedCount, 0);
    assert.deepEqual(result.failures, [{
      referenceId: 'finding-1',
      paragraphIndex: 0,
      reason: 'text-not-found'
    }]);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('keeps structural Word footnotes without duplicating their visible marker', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'autoria-apply-'));
  const inputPath = path.join(directory, 'input.docx');
  const outputPath = path.join(directory, 'output.docx');

  try {
    await createDocx(
      inputPath,
      '<w:p><w:r><w:t>Andorra é um principado</w:t></w:r><w:r><w:footnoteReference w:id="17888"/></w:r><w:r><w:t>.</w:t></w:r></w:p>'
    );

    const result = await applyNormUpdatesToDocx(inputPath, outputPath, [reference({
      fullText: 'Andorra é um principado[6].',
      suggestedText: 'Andorra é um microestado soberano[6].'
    })]);
    const xml = await readDocumentXml(outputPath);

    assert.equal(result.appliedCount, 1);
    assert.match(xml, /Andorra é um microestado soberano/);
    assert.equal((xml.match(/w:footnoteReference w:id="17888"/g) ?? []).length, 1);
    assert.doesNotMatch(xml, /\[6\]/);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('does not treat a self-closing Word text node as an opening tag', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'autoria-apply-'));
  const inputPath = path.join(directory, 'input.docx');
  const outputPath = path.join(directory, 'output.docx');

  try {
    await createDocx(
      inputPath,
      '<w:p><w:r><w:t xml:space="preserve"/></w:r><w:r><w:t>Andorra é um pequeno principado situado nos Pireneus.</w:t></w:r></w:p>'
    );

    const result = await applyNormUpdatesToDocx(inputPath, outputPath, [reference()]);
    const xml = await readDocumentXml(outputPath);

    assert.equal(result.appliedCount, 1);
    assert.doesNotMatch(xml, /<w:t\b[^>]*\/>[^<]*<\/w:t>/);
    await assert.doesNotReject(parseStringPromise(xml));
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('skips an invalid replacement while preserving other valid changes', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'autoria-apply-'));
  const inputPath = path.join(directory, 'input.docx');
  const outputPath = path.join(directory, 'output.docx');

  try {
    await createDocx(
      inputPath,
      '<w:p><w:r><w:t>Andorra é um pequeno principado situado nos Pireneus.</w:t></w:r></w:p>'
      + '<w:p><w:r><w:t>O segundo parágrafo também deve ser atualizado.</w:t></w:r></w:p>'
    );

    const result = await applyNormUpdatesToDocx(inputPath, outputPath, [
      reference(),
      reference({
        id: 'finding-invalid',
        paragraphIndex: 1,
        fullText: 'O segundo parágrafo também deve ser atualizado.',
        suggestedText: 'Texto inválido\u0001 para XML.',
      }),
    ]);
    const xml = await readDocumentXml(outputPath);

    assert.equal(result.appliedCount, 1);
    assert.deepEqual(result.appliedReferenceIds, ['finding-1']);
    assert.deepEqual(result.failures, [{
      referenceId: 'finding-invalid',
      paragraphIndex: 1,
      reason: 'invalid-xml',
    }]);
    assert.match(xml, /Andorra é um microestado soberano situado nos Pireneus\./);
    await assert.doesNotReject(parseStringPromise(xml));
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
