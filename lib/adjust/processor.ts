/**
 * Adjust Operation Processor
 * Applies custom user instructions to documents
 */

import { AdjustSuggestion } from './types';
import { extractDocumentStructure } from '@/lib/improvement/document-analyzer';
import { isGemini429, parseGeminiRetryDelayMs, sleep } from '@/lib/ai/gemini-retry';
import { isOpenAIGpt5Family, openaiCompletionTokenLimit } from '@/lib/ai/openai-compat';
import { resolveSkillPrompt } from '@/lib/skills/resolver';
import type { SkillContext } from '@/lib/skills/types';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { formatResearchEvidence, researchWithWebSearch } from '@/lib/ai/research';
import { BOOK_RESEARCH_DOMAINS } from '@/lib/book-workflow/prompts';
import { sanitizeEditorialText } from '@/lib/book-workflow/output';

/**
 * Analyze document and generate adjustments based on instructions
 */
export async function analyzeDocumentForAdjustments(
  documentPath: string,
  instructions: string,
  creativity: number,
  provider: 'openai' | 'gemini' | 'grok' | 'anthropic',
  model: string,
  apiKey: string,
  useGrounding: boolean = false,
  /** Optional checkpoint that throws if the caller wants to abort.
   * Called between sections AND between batches inside each section. */
  cancelCheck?: () => void,
  skillContext: SkillContext = 'direct',
  onProgress?: (currentBatch: number, totalBatches: number) => void | Promise<void>
): Promise<AdjustSuggestion[]> {
  console.log('[ADJUST] Extracting document structure...');

  // Extract document structure
  const { structure, paragraphs } = await extractDocumentStructure(documentPath);

  console.log(`[ADJUST] Found ${paragraphs.length} paragraphs`);
  console.log(`[ADJUST] Instructions: ${instructions.substring(0, 100)}...`);

  const allSuggestions: AdjustSuggestion[] = [];

  // Process in batches
  const BATCH_SIZE = 20;
  const totalBatches = structure.sections.reduce((total, section) => {
    const paragraphCount = paragraphs
      .slice(section.startParagraphIndex, section.endParagraphIndex + 1)
      .filter((paragraph) => !paragraph.isHeader).length;
    return total + Math.ceil(paragraphCount / BATCH_SIZE);
  }, 0);
  let completedBatches = 0;

  for (let i = 0; i < structure.sections.length; i++) {
    cancelCheck?.();
    const section = structure.sections[i];
    const sectionParagraphs = paragraphs
      .slice(section.startParagraphIndex, section.endParagraphIndex + 1)
      .filter(p => !p.isHeader)
      .map(p => ({ text: p.text, index: p.index }));

    console.log(`[ADJUST] Analyzing section ${i + 1}/${structure.sections.length}: "${section.title.substring(0, 50)}"`);

    // Process section in batches
    for (let batchStart = 0; batchStart < sectionParagraphs.length; batchStart += BATCH_SIZE) {
      cancelCheck?.();
      const batchEnd = Math.min(batchStart + BATCH_SIZE, sectionParagraphs.length);
      const batch = sectionParagraphs.slice(batchStart, batchEnd);

      const suggestions = await analyzeBatch(
        batch,
        section.title,
        instructions,
        creativity,
        provider,
        model,
        apiKey,
        useGrounding,
        skillContext
      );

      allSuggestions.push(...suggestions);
      completedBatches += 1;
      await onProgress?.(completedBatches, Math.max(1, totalBatches));
    }
  }

  console.log(`[ADJUST] Generated ${allSuggestions.length} adjustment suggestions`);

  return allSuggestions;
}

/**
 * Analyze a batch of paragraphs
 */
async function analyzeBatch(
  paragraphs: Array<{ text: string; index: number }>,
  sectionTitle: string,
  instructions: string,
  creativity: number,
  provider: 'openai' | 'gemini' | 'grok' | 'anthropic',
  model: string,
  apiKey: string,
  useGrounding: boolean = false,
  skillContext: SkillContext = 'direct'
): Promise<AdjustSuggestion[]> {

  let prompt = buildPrompt(paragraphs, sectionTitle, instructions, creativity, skillContext);

  if (useGrounding && provider !== 'gemini') {
    try {
      const research = await researchWithWebSearch({
        provider,
        model,
        apiKey,
        depth: 'deep',
        topic: `Pesquise fontes atuais e verificáveis para executar esta tarefa editorial no trecho "${sectionTitle}": ${instructions.substring(0, 2_000)}`,
        context: paragraphs.map((paragraph) => paragraph.text).join('\n\n').substring(0, 12_000),
        preferredDomains: [...BOOK_RESEARCH_DOMAINS],
      });
      prompt += `\n\nPESQUISA WEB OBRIGATÓRIA\nUse somente evidências realmente devolvidas abaixo para afirmações factuais novas. Inclua as URLs pertinentes no campo reason, nunca em metatexto dentro de adjustedText.\n\nSÍNTESE\n${research.text.substring(0, 12_000)}\n\nFONTES\n${formatResearchEvidence(research.sources)}`;
    } catch (error) {
      console.warn('[ADJUST] Web research failed; factual additions must be omitted or marked for verification.', error);
      prompt += '\n\nA pesquisa web falhou. Não introduza nenhuma afirmação factual nova sem fonte; limite-se a análise autoral fundamentada e registre [VERIFICAR] no campo reason.';
    }
  }

  let responseText = '';

  if (provider === 'openai' || provider === 'grok') {
    const client = new OpenAI({
      apiKey,
      baseURL: provider === 'grok' ? 'https://api.x.ai/v1' : undefined
    });

    const response = await client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      ...(provider === 'grok' || !isOpenAIGpt5Family(model)
        ? { temperature: creativity / 10 }
        : {}),
      ...(provider === 'grok'
        ? { max_tokens: 12000 }
        : openaiCompletionTokenLimit(model, 12000)),
      response_format: { type: 'json_object' }
    });

    responseText = response.choices[0].message.content || '{}';

  } else if (provider === 'anthropic') {
    const { anthropicChat } = await import('@/lib/ai/anthropic');
    const { text } = await anthropicChat({
      apiKey,
      model,
      system:
        'Responda apenas com um objeto JSON válido conforme o formato pedido no enunciado. Sem markdown.',
      user: prompt,
      maxTokens: 12000,
      temperature: creativity / 10
    });
    responseText = text || '{}';
  } else {
    // Gemini with 429 retry (quota/rate limit)
    const genAI = new GoogleGenerativeAI(apiKey);
    const modelConfig: any = {
      model,
      generationConfig: {
        temperature: creativity / 10,
        maxOutputTokens: 8192
      }
    };
    if (useGrounding) {
      console.log('[ADJUST] Using Google Search Grounding');
      modelConfig.tools = [{ googleSearch: {} }];
    } else {
      modelConfig.generationConfig.responseMimeType = 'application/json';
    }
    const geminiModel = genAI.getGenerativeModel(modelConfig);
    const maxRetries = 4;
    let lastError: any;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await geminiModel.generateContent(prompt);
        responseText = result.response.text();
        lastError = undefined;
        break;
      } catch (err: any) {
        lastError = err;
        if (isGemini429(err) && attempt < maxRetries) {
          const delayMs = parseGeminiRetryDelayMs(err);
          console.warn(`[ADJUST] Gemini 429 (tentativa ${attempt}/${maxRetries}), aguardando ${(delayMs / 1000).toFixed(1)}s...`);
          await sleep(delayMs);
        } else {
          throw err;
        }
      }
    }
    if (lastError) throw lastError;
  }

  // Parse response
  try {
    // Strip markdown code blocks if present (happens with grounding)
    let jsonText = responseText.trim();
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    const parsed = JSON.parse(jsonText);
    const suggestions: AdjustSuggestion[] = (parsed.adjustments || []).map((adj: any) => ({
      id: `adj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      paragraphIndex: adj.paragraphIndex || 0,
      sectionTitle,
      originalText: adj.originalText || '',
      adjustedText: sanitizeEditorialText(adj.adjustedText),
      reason: adj.reason || '',
      instructionReference: adj.instructionReference || ''
    }));

    return suggestions;

  } catch (error) {
    console.error('[ADJUST] Failed to parse response:', error);
    console.error('[ADJUST] Response text:', responseText.substring(0, 500));
    return [];
  }
}

/**
 * Build prompt for AI
 */
function buildPrompt(
  paragraphs: Array<{ text: string; index: number }>,
  sectionTitle: string,
  instructions: string,
  creativity: number,
  skillContext: SkillContext = 'direct'
): string {
  const paragraphsText = paragraphs
    .map((p, idx) => `[${idx}] ${p.text}`)
    .join('\n\n');

  return resolveSkillPrompt(
    'adjust',
    {
      args: instructions,
      section: sectionTitle,
      paragraphs: paragraphsText,
      creativity,
    },
    skillContext
  );
}
