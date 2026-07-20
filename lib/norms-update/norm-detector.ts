import { NormReference, NormType } from './types';
import { isGemini429, parseGeminiRetryDelayMs, sleep } from '@/lib/ai/gemini-retry';
import { isOpenAIGpt5Family } from '@/lib/ai/openai-compat';
import { randomUUID } from 'crypto';

/**
 * Detecta referências a normas, leis, decretos no documento usando IA
 */
export async function detectNormsInDocument(
  paragraphs: Array<{ text: string; index: number; chapterTitle?: string }>,
  provider: 'openai' | 'gemini' | 'anthropic',
  model: string,
  apiKey: string
): Promise<NormReference[]> {

  // Processa em batches de 20 parágrafos
  const batchSize = 20;
  const allReferences: NormReference[] = [];
  const errors: Array<{batch: number, type: string, details: string}> = [];

  console.log(`[NORMS] Analyzing ${paragraphs.length} paragraphs in ${Math.ceil(paragraphs.length / batchSize)} batches...`);

  for (let i = 0; i < paragraphs.length; i += batchSize) {
    const batch = paragraphs.slice(i, i + batchSize);
    const batchText = batch.map((p, idx) => `[${i + idx}] ${p.text}`).join('\n\n');

    console.log(`[NORMS] Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(paragraphs.length / batchSize)} (paragraphs ${i}-${Math.min(i + batchSize, paragraphs.length)})...`);

    const prompt = `Você é um especialista em análise de documentos jurídicos e técnicos. Analise o texto abaixo e identifique TODAS as referências a normas, leis, decretos, portarias, resoluções e normas técnicas.

TIPOS DE NORMAS A IDENTIFICAR (com número/identificação específica):
1. LEIS: Lei nº 8.078/1990, Lei Federal 12.345/2020, Ley 123/2020, etc
2. DECRETOS: Decreto nº 10.024/2019, Real Decreto 456/2019, etc
3. PORTARIAS: Portaria nº 123/2021, etc
4. RESOLUÇÕES: Resolución nº 456/2022, etc
5. NORMAS ABNT: ABNT NBR 14724:2011, NBR ISO 9001:2015, etc
6. NORMAS ISO: ISO 9001:2015, ISO/IEC 27001:2013, etc
7. REGULAMENTOS COM NÚMERO: Regulamento (UE) 2016/679, Directiva 2011/16/UE, etc
8. TRATADOS/CONVENIOS ESPECÍFICOS: Convenio de Mutua Asistencia Administrativa en Materia Fiscal de la OCDE, etc

NÃO IDENTIFIQUE (falsos positivos):
❌ Menções genéricas a organizações: "OCDE", "UE", "ONU"
❌ Referências genéricas: "esta ley", "la legislación", "normas de la organización"
❌ Informes/relatórios: "informe de 1998", "informe de la OCDE"
❌ Artigos sem contexto: "artículo 6º" (a menos que seja parte de uma norma específica citada antes)
❌ Siglas sem número: "FATCA" (a menos que seja uma lei específica com número)

TEXTO PARA ANÁLISE:
---
${batchText}
---

Para cada referência encontrada, retorne JSON no formato:
{
  "references": [
    {
      "type": "lei|decreto|portaria|resolucao|abnt|iso|regulamento|outro",
      "number": "número da norma (ex: 8.078/1990, NBR 14724:2011)",
      "fullText": "texto completo como aparece (ex: Lei nº 8.078/1990)",
      "paragraphIndex": 0,
      "context": "trecho do texto ao redor (30-50 chars antes e depois)"
    }
  ]
}

REGRAS IMPORTANTES:
- Extraia APENAS referências explícitas a normas
- NÃO invente números ou referências que não existem
- Capture o texto EXATO como aparece no documento
- Se não houver referências, retorne: {"references": []}
- paragraphIndex deve corresponder ao número entre colchetes [X]

FORMATO DA RESPOSTA:
Retorne APENAS um objeto JSON válido, sem markdown, sem explicações, sem texto adicional.
Comece sua resposta com { e termine com }
Não use blocos de código markdown.

Retorne APENAS o JSON.`;

    try {
      let response: string;

      if (provider === 'openai') {
        const OpenAI = (await import('openai')).default;
        const openai = new OpenAI({ apiKey });

        const completion = await openai.chat.completions.create({
          model,
          messages: [{ role: 'user', content: prompt }],
          ...(isOpenAIGpt5Family(model) ? {} : { temperature: 0.1 }),
          max_tokens: 12000, // Aumentado para permitir detecções muito detalhadas
          response_format: { type: 'json_object' }
        });

        response = completion.choices[0]?.message?.content?.trim() || '{"references":[]}';
      } else if (provider === 'anthropic') {
        const { anthropicChat } = await import('@/lib/ai/anthropic');
        const { text } = await anthropicChat({
          apiKey,
          model,
          system:
            'Responda estritamente com um único objeto JSON válido conforme o pedido. Sem markdown, sem texto fora do JSON.',
          user: prompt,
          maxTokens: 12000,
          temperature: 0.1
        });
        response = text || '{"references":[]}';
      } else {
        // Gemini with 429 retry
        const { GoogleGenerativeAI } = await import('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(apiKey);
        const geminiModel = genAI.getGenerativeModel({
          model,
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 8192
          }
        });
        const maxRetries = 4;
        let result: Awaited<ReturnType<typeof geminiModel.generateContent>>;
        let lastErr: any;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            result = await geminiModel.generateContent(prompt);
            lastErr = undefined;
            break;
          } catch (err: any) {
            lastErr = err;
            if (isGemini429(err) && attempt < maxRetries) {
              const delayMs = parseGeminiRetryDelayMs(err);
              console.warn(`[NORMS] Gemini 429 (tentativa ${attempt}/${maxRetries}), aguardando ${(delayMs / 1000).toFixed(1)}s...`);
              await sleep(delayMs);
            } else {
              throw err;
            }
          }
        }
        if (lastErr) throw lastErr;
        // Debug: Verifica se há bloqueios ou problemas
        const candidate = result!.response.candidates?.[0];
        if (candidate?.finishReason && candidate.finishReason !== 'STOP') {
          errors.push({
            batch: Math.floor(i / batchSize) + 1,
            type: 'GEMINI_BLOCKED',
            details: `finishReason: ${candidate.finishReason}\nfullResponse: ${JSON.stringify(result!.response, null, 2)}`
          });
          continue;
        }
        response = result!.response.text().trim();
      }

      // Parse JSON response - remove markdown code blocks primeiro
      const batchNum = Math.floor(i / batchSize) + 1;

      // Se resposta está vazia, pula
      if (!response || response.trim().length === 0) {
        errors.push({
          batch: batchNum,
          type: 'EMPTY_RESPONSE',
          details: 'AI returned empty response'
        });
        continue;
      }

      let cleanedResponse = response.replace(/```json\s*/g, '').replace(/```\s*/g, '');
      const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);

      if (!jsonMatch) {
        errors.push({
          batch: batchNum,
          type: 'NO_JSON',
          details: `Response length: ${response.length} chars\nFirst 300: ${response.substring(0, 300)}\nLast 300: ${response.substring(Math.max(0, response.length - 300))}`
        });
        continue;
      }

      let parsed;
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch (parseError: any) {
        errors.push({
          batch: batchNum,
          type: 'JSON_PARSE_ERROR',
          details: `Error: ${parseError.message}\nJSON start: ${jsonMatch[0].substring(0, 300)}\nJSON end: ${jsonMatch[0].substring(Math.max(0, jsonMatch[0].length - 300))}`
        });
        continue;
      }

      const references = parsed.references || [];

      // Processa e valida referências
      for (const ref of references) {
        if (!ref.type || !ref.number || !ref.fullText) {
          errors.push({
            batch: batchNum,
            type: 'INVALID_REFERENCE',
            details: `Missing required fields: ${JSON.stringify(ref)}`
          });
          continue;
        }

        // A IA retorna o índice absoluto (número entre colchetes [X])
        const absoluteIndex = ref.paragraphIndex || 0;

        if (absoluteIndex >= paragraphs.length) {
          errors.push({
            batch: batchNum,
            type: 'INVALID_INDEX',
            details: `Paragraph index ${absoluteIndex} >= total paragraphs ${paragraphs.length}`
          });
          continue;
        }

        const paragraph = paragraphs[absoluteIndex];

        // Verifica se o texto realmente existe no parágrafo
        if (!paragraph.text.includes(ref.fullText)) {
          errors.push({
            batch: batchNum,
            type: 'TEXT_NOT_FOUND',
            details: `Text "${ref.fullText}" not found in paragraph ${absoluteIndex}`
          });
          continue;
        }

        allReferences.push({
          id: randomUUID(),
          type: ref.type as NormType,
          number: ref.number.trim(),
          fullText: ref.fullText.trim(),
          context: ref.context?.trim() || '',
          paragraphIndex: absoluteIndex,
          chapterTitle: paragraph.chapterTitle
        });
      }

    } catch (error: any) {
      errors.push({
        batch: Math.floor(i / batchSize) + 1,
        type: 'EXCEPTION',
        details: `${error.message}\n${error.stack || ''}`
      });
    }
  }

  // Relatório consolidado no final
  console.log('\n' + '='.repeat(80));
  console.log('📊 NORM DETECTION REPORT');
  console.log('='.repeat(80));
  console.log(`✅ Successfully detected: ${allReferences.length} norm references`);
  console.log(`⚠️  Errors encountered: ${errors.length}`);

  if (errors.length > 0) {
    console.log('\n' + '-'.repeat(80));
    console.log('❌ ERROR DETAILS:');
    console.log('-'.repeat(80));

    // Agrupa erros por tipo
    const errorsByType: Record<string, typeof errors> = {};
    errors.forEach(err => {
      if (!errorsByType[err.type]) errorsByType[err.type] = [];
      errorsByType[err.type].push(err);
    });

    Object.entries(errorsByType).forEach(([type, errs]) => {
      console.log(`\n📍 ${type} (${errs.length} occurrences):`);
      errs.forEach(err => {
        console.log(`  Batch ${err.batch}:`);
        console.log(`  ${err.details.split('\n').join('\n  ')}`);
        console.log('');
      });
    });
  }

  console.log('='.repeat(80) + '\n');

  return allReferences;
}

/**
 * Classifica o tipo de norma baseado em padrões comuns
 */
export function classifyNormType(text: string): NormType {
  const lower = text.toLowerCase();

  if (lower.includes('lei') && /\d+/.test(text)) return 'lei';
  if (lower.includes('decreto') && /\d+/.test(text)) return 'decreto';
  if (lower.includes('portaria') && /\d+/.test(text)) return 'portaria';
  if (lower.includes('resolução') || lower.includes('resolucao')) return 'resolucao';
  if (lower.includes('abnt') || lower.includes('nbr')) return 'abnt';
  if (lower.includes('iso')) return 'iso';
  if (lower.includes('regulamento')) return 'regulamento';

  return 'outro';
}
