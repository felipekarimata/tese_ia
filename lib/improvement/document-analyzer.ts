import JSZip from 'jszip';
import { parseStringPromise } from 'xml2js';
import fs from 'fs/promises';
import { isOpenAIGpt5Family } from '@/lib/ai/openai-compat';
import { DocumentStructure, GlobalContext } from './types';

/**
 * Extrai texto de um nó recursivamente
 */
function extractTextFromNode(obj: any): string {
  if (!obj || typeof obj !== 'object') return '';

  let text = '';

  // Extrai de tags <w:t>
  if (obj['w:t']) {
    const textArray = Array.isArray(obj['w:t']) ? obj['w:t'] : [obj['w:t']];
    textArray.forEach((tNode: any) => {
      if (typeof tNode === 'string') {
        text += tNode;
      } else if (tNode._) {
        text += tNode._;
      }
    });
  }

  // Recursão
  for (const key in obj) {
    if (key === 'w:t') continue;
    if (Array.isArray(obj[key])) {
      obj[key].forEach((item: any) => {
        text += extractTextFromNode(item);
      });
    } else if (typeof obj[key] === 'object') {
      text += extractTextFromNode(obj[key]);
    }
  }

  return text;
}

/**
 * Detecta se um parágrafo é um header (título de capítulo/seção)
 */
function detectHeaderLevel(paragraph: any): number | null {
  // Procura por estilos de header (pStyle)
  if (paragraph['w:pPr']) {
    const pPr = Array.isArray(paragraph['w:pPr']) ? paragraph['w:pPr'][0] : paragraph['w:pPr'];
    if (pPr['w:pStyle']) {
      const style = Array.isArray(pPr['w:pStyle']) ? pPr['w:pStyle'][0] : pPr['w:pStyle'];
      const styleName = style.$?.['w:val'] || style._ || '';

      // Detecta Heading1, Heading2, etc
      if (styleName.toLowerCase().includes('heading')) {
        const match = styleName.match(/(\d+)/);
        if (match) return parseInt(match[1]);
        return 1; // Heading sem número = H1
      }

      // Detecta Título, Ttulo1, etc
      if (styleName.toLowerCase().match(/t[ií]tulo|title/)) {
        const match = styleName.match(/(\d+)/);
        if (match) return parseInt(match[1]);
        return 1;
      }
    }
  }

  return null;
}

/**
 * Extrai estrutura do documento (capítulos, seções, parágrafos)
 */
export async function extractDocumentStructure(filePath: string): Promise<{
  structure: DocumentStructure;
  paragraphs: Array<{ text: string; isHeader: boolean; headerLevel?: number; index: number }>;
}> {
  const data = await fs.readFile(filePath);
  const zip = await JSZip.loadAsync(data);

  const file = zip.file('word/document.xml');
  if (!file) throw new Error('document.xml not found');

  const xmlContent = await file.async('string');
  const parsed = await parseStringPromise(xmlContent);

  const paragraphs: Array<{ text: string; isHeader: boolean; headerLevel?: number; index: number }> = [];
  const sections: DocumentStructure['sections'] = [];

  // Extrai todos os parágrafos
  const body = parsed['w:document']?.['w:body']?.[0];
  if (!body) throw new Error('Document body not found');

  const allParagraphs = body['w:p'] || [];

  allParagraphs.forEach((para: any, idx: number) => {
    const text = extractTextFromNode(para).trim();
    if (!text) return; // Pula parágrafos vazios

    const headerLevel = detectHeaderLevel(para);
    const isHeader = headerLevel !== null;

    paragraphs.push({
      text,
      isHeader,
      headerLevel,
      index: paragraphs.length // Index real (sem vazios)
    });

    // Se é header de nível 1 ou 2, cria nova seção
    if (isHeader && headerLevel && headerLevel <= 2) {
      // Finaliza seção anterior
      if (sections.length > 0) {
        sections[sections.length - 1].endParagraphIndex = paragraphs.length - 2;
        sections[sections.length - 1].paragraphCount =
          sections[sections.length - 1].endParagraphIndex -
          sections[sections.length - 1].startParagraphIndex + 1;
      }

      // Inicia nova seção
      sections.push({
        title: text,
        level: headerLevel,
        startParagraphIndex: paragraphs.length - 1,
        endParagraphIndex: paragraphs.length - 1, // Será atualizado depois
        paragraphCount: 0
      });
    }
  });

  console.log(`[IMPROVE] Extracted ${paragraphs.length} paragraphs`);
  console.log(`[IMPROVE] Found ${sections.length} sections with styles`);

  // Finaliza última seção
  if (sections.length > 0) {
    sections[sections.length - 1].endParagraphIndex = paragraphs.length - 1;
    sections[sections.length - 1].paragraphCount =
      sections[sections.length - 1].endParagraphIndex -
      sections[sections.length - 1].startParagraphIndex + 1;
  }

  // FALLBACK: Se não encontrou nenhuma seção, cria uma seção única com todo o documento
  if (sections.length === 0 && paragraphs.length > 0) {
    console.log('[IMPROVE] No sections found with styles, creating single section for entire document');

    // Usa o primeiro parágrafo como título, ou um título genérico
    const title = paragraphs[0]?.text.substring(0, 100) || 'Documento';

    sections.push({
      title,
      level: 1,
      startParagraphIndex: 0,
      endParagraphIndex: paragraphs.length - 1,
      paragraphCount: paragraphs.length
    });

    console.log(`[IMPROVE] Created fallback section with ${paragraphs.length} paragraphs`);
  }

  const structure: DocumentStructure = {
    sections,
    totalParagraphs: paragraphs.length,
    totalChapters: sections.filter(s => s.level === 1).length
  };

  console.log(`[IMPROVE] Final structure: ${structure.sections.length} sections, ${structure.totalParagraphs} paragraphs`);

  return { structure, paragraphs };
}

/**
 * Gera contexto global do documento (resumo, tema, objetivo)
 */
export async function generateGlobalContext(
  paragraphs: Array<{ text: string; isHeader: boolean; headerLevel?: number }>,
  structure: DocumentStructure,
  provider: 'openai' | 'gemini' | 'anthropic',
  model: string,
  apiKey: string,
  referencesContext: string = ''
): Promise<GlobalContext> {
  // Pega primeiras páginas (até 3000 chars) + índice (títulos dos capítulos)
  const initialText = paragraphs
    .slice(0, Math.min(20, paragraphs.length))
    .map(p => p.text)
    .join('\n\n')
    .substring(0, 3000);

  const chapterTitles = structure.sections
    .filter(s => s.level === 1)
    .map(s => s.title);

  // Extrai início de cada capítulo para resumo (primeiros 800 chars de cada)
  const chapterPreviews = structure.sections
    .filter(s => s.level === 1)
    .map(section => {
      const chapterParas = paragraphs
        .slice(section.startParagraphIndex, section.endParagraphIndex + 1)
        .filter(p => !p.isHeader)
        .map(p => p.text)
        .join('\n\n')
        .substring(0, 800);

      return {
        title: section.title,
        preview: chapterParas
      };
    });

  const prompt = `Você é um analista de documentos acadêmicos. Analise este documento e extraia:

1. TEMA PRINCIPAL: Qual é o assunto central do documento? (1 frase)
2. OBJETIVO: Qual o objetivo/propósito do documento? (1 frase)
3. TIPO: Que tipo de documento é? (tese, dissertação, artigo, etc)
4. RESUMO DE CADA CAPÍTULO: Para cada capítulo, faça um resumo de 1-2 frases do conteúdo

INÍCIO DO DOCUMENTO:
---
${initialText}
---

CAPÍTULOS E TRECHOS:
${chapterPreviews.map((ch, i) => `
${i + 1}. ${ch.title}
---
${ch.preview}
---
`).join('\n')}
${referencesContext ? `\n${referencesContext}` : ''}

Retorne APENAS um JSON válido no formato:
{
  "theme": "tema principal em 1 frase",
  "objective": "objetivo em 1 frase",
  "type": "tipo do documento",
  "chapterSummaries": [
    {"title": "título do capítulo 1", "summary": "resumo em 1-2 frases"},
    {"title": "título do capítulo 2", "summary": "resumo em 1-2 frases"}
  ]
}`;

  let response: string;

  if (provider === 'openai') {
    const OpenAI = (await import('openai')).default;
    const openai = new OpenAI({ apiKey });

    const completion = await openai.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      ...(isOpenAIGpt5Family(model) ? {} : { temperature: 0.3 }),
      max_tokens: 8000, // Aumentado para permitir análises globais muito detalhadas
      response_format: { type: 'json_object' }
    });

    response = completion.choices[0]?.message?.content?.trim() || '{}';
  } else if (provider === 'anthropic') {
    const { anthropicChat } = await import('@/lib/ai/anthropic');
    const { text } = await anthropicChat({
      apiKey,
      model,
      system:
        'Responda apenas com um objeto JSON válido conforme o formato pedido. Sem markdown.',
      user: prompt,
      maxTokens: 8000,
      temperature: 0.3
    });
    response = text || '{}';
  } else {
    // Gemini with 429 retry
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const { isGemini429, parseGeminiRetryDelayMs, sleep } = await import('@/lib/ai/gemini-retry');
    const genAI = new GoogleGenerativeAI(apiKey);
    const geminiModel = genAI.getGenerativeModel({
      model,
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 8192
      }
    });
    const maxRetries = 4;
    let lastErr: any;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await geminiModel.generateContent(prompt);
        response = result.response.text().trim();
        lastErr = undefined;
        break;
      } catch (err: any) {
        lastErr = err;
        if (isGemini429(err) && attempt < maxRetries) {
          const delayMs = parseGeminiRetryDelayMs(err);
          console.warn(`[DOC-ANALYZER] Gemini 429 (tentativa ${attempt}/${maxRetries}), aguardando ${(delayMs / 1000).toFixed(1)}s...`);
          await sleep(delayMs);
        } else {
          throw err;
        }
      }
    }
    if (lastErr) throw lastErr;
  }

  // Parse JSON response
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};

  // Detecta título do documento (primeiro header ou primeiras palavras)
  const title = paragraphs.find(p => p.isHeader)?.text ||
                paragraphs[0]?.text.substring(0, 100);

  return {
    title,
    theme: parsed.theme || 'Documento acadêmico',
    objective: parsed.objective,
    chapters: chapterTitles,
    chapterSummaries: parsed.chapterSummaries || []
  };
}
