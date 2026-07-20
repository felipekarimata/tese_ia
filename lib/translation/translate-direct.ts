import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import { isOpenAIGpt5Family } from '@/lib/ai/openai-compat';
import { AIProvider } from '../ai/types';
import { state } from '../state';
import { isGemini429, parseGeminiRetryDelayMs, sleep } from '../ai/gemini-retry';
import { protectElements, restoreElements, validatePlaceholders } from './validation-enhancer';
import { protectGlossaryTerms, restoreGlossaryTerms, DEFAULT_GLOSSARY, type GlossaryEntry } from './glossary';

/**
 * Traduz texto usando APENAS OpenAI com retry automático em caso de rate limit
 */
export async function translateTextDirect(
  text: string,
  targetLanguage: string,
  sourceLanguage: string | undefined,
  provider: AIProvider,
  model: string,
  glossary?: GlossaryEntry[]
): Promise<string> {
  let workingText = text;

  // 🛡️ STEP 1: Protect numbers, dates, and proper nouns
  const { protectedText, elements } = protectElements(workingText);
  const hasProtectedElements = elements.numbers.size > 0 || elements.dates.size > 0;

  if (hasProtectedElements) {
    console.log(`[PROTECT] Protected ${elements.numbers.size} numbers, ${elements.dates.size} dates`);
  }

  // DEBUG: Log source/target languages
  console.log(`[TRANSLATE-DIRECT] Source: ${sourceLanguage || 'AUTO-DETECT'} → Target: ${targetLanguage}`);

  const prompt = `You are a PROFESSIONAL TRANSLATOR. Your ONLY job is to translate text WORD-BY-WORD with ABSOLUTE FIDELITY.

TARGET LANGUAGE: ${targetLanguage.toUpperCase()}
${sourceLanguage ? `SOURCE LANGUAGE: ${sourceLanguage.toUpperCase()}` : 'Auto-detect source language'}

CRITICAL RULES - VIOLATING ANY WILL RESULT IN FAILURE:
❌ DO NOT summarize, shorten, or condense the text
❌ DO NOT paraphrase or change sentence structure
❌ DO NOT add explanations, notes, or extra content
❌ DO NOT skip any sentences, paragraphs, or words
❌ DO NOT change the meaning or interpretation
❌❌❌ NEVER EVER MERGE WORDS TOGETHER - THIS IS THE MOST CRITICAL RULE ❌❌❌
   WRONG EXAMPLE: "OCDEestácaracterizacomouma" (NO SPACES - UNACCEPTABLE!)
   RIGHT EXAMPLE: "OCDE está caracterizada como uma" (WITH SPACES - CORRECT!)

✅ TRANSLATE EVERY SINGLE WORD faithfully based on CONTEXT:
   - Articles (el/la/los/las/le/the/a/an) should be translated even in UPPERCASE unless they are acronyms
   - Example: "LA Organización" (Spanish article) → "A Organização" (Portuguese)
   - But: "LA" (Los Angeles city) → keep "LA"
   - Analyze context to determine if capitalized words are articles, acronyms, or proper nouns
✅ PRESERVE exact same number of sentences
✅ PRESERVE exact same paragraph structure
✅ PRESERVE all line breaks and spacing (especially double line breaks \\n\\n between paragraphs)
✅✅✅ EVERY WORD MUST BE SEPARATED BY SPACES - MANDATORY! ✅✅✅
✅ Each word must have AT LEAST ONE SPACE before and after it
✅ IF the text contains multiple paragraphs separated by blank lines, you MUST preserve these separations in the translation
✅ KEEP technical terms accurate (translate if appropriate, keep if universally used)
✅ MAINTAIN the same academic/formal tone
✅ Double-check your translation has proper spacing between ALL words before returning it
${hasProtectedElements ? '✅ PRESERVE ALL PLACEHOLDERS like __NUM_0__, __DATE_1__ EXACTLY as they appear - DO NOT translate them!' : ''}
✅ Return ONLY the direct translation, nothing else

ORIGINAL TEXT (${protectedText.length} characters, ${protectedText.split(/[.!?]+/).length} sentences):
---
${protectedText}
---

⚠️ CRITICAL REMINDER BEFORE YOU START:
- EVERY word MUST be separated by spaces
- "palavra1palavra2palavra3" = WRONG ❌
- "palavra1 palavra2 palavra3" = CORRECT ✅
- Check your translation has spaces between ALL words before submitting

TRANSLATION (must have similar length and same number of sentences, with MANDATORY SPACES between ALL words${hasProtectedElements ? ', and KEEP all __NUM_X__ and __DATE_X__ placeholders' : ''}):`;

  console.log(`[TRANSLATE] Text: ${text.length} chars → Using ${provider} (${model})`);
  console.log(`[TRANSLATE] 📤 SENDING TO AI:\n---\n${protectedText}\n---`);

  let result: string;
  switch (provider) {
    case 'gemini':
      result = await translateWithGemini(prompt, model, 16384);
      break;
    case 'grok':
      result = await translateWithGrok(prompt, model, 16384);
      break;
    case 'anthropic':
      result = await translateWithAnthropic(prompt, model, 16384);
      break;
    case 'openai':
    default:
      result = await translateWithOpenAI(prompt, model, 16384);
      break;
  }

  console.log(`[TRANSLATE] 📥 RECEIVED FROM AI:\n---\n${result}\n---`);

  // 🛡️ STEP 2: Restore protected elements
  let finalResult = result;

  if (hasProtectedElements) {
    const validation = validatePlaceholders(protectedText, finalResult, elements);
    if (!validation.valid) {
      console.warn(`[PROTECT] Validation warning: ${validation.missing.length} missing, ${validation.extra.length} extra placeholders`);
    }
    finalResult = restoreElements(finalResult, elements);
    console.log(`[PROTECT] Restored ${elements.numbers.size + elements.dates.size} protected elements`);
  }

  return finalResult;
}

/** Request timeout for each API call (2 min) - avoids hanging on rate limit or slow server */
const REQUEST_TIMEOUT_MS = 120000;

/**
 * Delay helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isTimeoutOrRateLimit(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const msg = (error as any).message ?? '';
  const code = (error as any).code;
  return (
    msg.includes('429') ||
    msg.includes('Rate limit') ||
    msg.includes('timeout') ||
    msg.includes('ETIMEDOUT') ||
    msg.includes('ECONNRESET') ||
    (error as any).name === 'AbortError' ||
    code === 'ECONNABORTED'
  );
}

/**
 * Traduz usando Gemini com retry e backoff exponencial
 */
async function translateWithGemini(prompt: string, model: string, maxTokens: number): Promise<string> {
  const apiKey = state.settings.googleKey;
  if (!apiKey) throw new Error('Google API key not configured');

  const genAI = new GoogleGenerativeAI(apiKey);
  const geminiModel = genAI.getGenerativeModel({ model });

  const maxRetries = 4; // More attempts for timeout/rate limit before failing
  let lastError: any;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const delayMs = lastError && isGemini429(lastError)
          ? parseGeminiRetryDelayMs(lastError)
          : 5000;
        console.log(`[GEMINI] ⏳ Retry ${attempt}/${maxRetries} after ${(delayMs / 1000).toFixed(1)}s...`);
        await sleep(delayMs);
      }

      const result = await Promise.race([
        geminiModel.generateContent({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: maxTokens
          }
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Translation timeout after 40% - possibly API rate limit or server timeout')), REQUEST_TIMEOUT_MS)
        )
      ]);

      const response = result.response;
      const text = response.text().trim();

      if (!text || text.length === 0) {
        // Resposta vazia não faz retry - cai direto pro fallback
        throw new Error('Gemini returned empty response (no retry)');
      }

      // Sucesso! Delay reduzido (0.8s suficiente)
      await sleep(800);

      return text;

    } catch (error: any) {
      lastError = error;

      // Se for resposta vazia, não tenta de novo - já vai pro fallback
      if (error.message?.includes('empty response')) {
        throw error;
      }
      const is503 = error.message?.includes('503') || error.message?.includes('overloaded');
      const is429 = error.message?.includes('429') || error.message?.includes('quota');
      const isTimeout = error.message?.includes('timeout') || isTimeoutOrRateLimit(error);

      if (is503 || is429 || isTimeout) {
        console.warn(`[GEMINI] ⚠ Rate limit/Overload/Timeout (attempt ${attempt + 1}/${maxRetries}):`, error.message);
        continue;
      }
      console.error('[GEMINI] ❌ Error:', error.message);
      throw error;
    }
  }

  console.error('[GEMINI] ❌ Failed after', maxRetries, 'attempts');
  if (lastError && isTimeoutOrRateLimit(lastError)) {
    throw new Error('Translation timeout after 40% - possibly API rate limit or server timeout');
  }
  throw lastError;
}

/**
 * Traduz usando OpenAI com retry em caso de rate limit (429) ou timeout
 */
async function translateWithOpenAI(prompt: string, model: string, maxTokens: number): Promise<string> {
  const apiKey = state.settings.openaiKey;
  if (!apiKey) throw new Error('OpenAI API key not configured');

  const openai = new OpenAI({ apiKey });
  const maxRetries = 10;
  let lastError: unknown;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const completion = await openai.chat.completions.create(
        {
          model,
          messages: [{ role: 'user', content: prompt }],
          ...(isOpenAIGpt5Family(model) ? {} : { temperature: 0.3 }),
          max_tokens: maxTokens
        },
        { signal: controller.signal }
      );

      clearTimeout(timeoutId);

      const result = completion.choices[0]?.message?.content?.trim() || '';
      if (!result || result.length === 0) {
        throw new Error('OpenAI returned empty response');
      }
      return result;
    } catch (error: unknown) {
      clearTimeout(timeoutId);
      lastError = error;

      const is429 =
        (error as any)?.message?.includes('429') ||
        (error as any)?.message?.includes('Rate limit') ||
        (error as any)?.status === 429;
      const isTimeout = (error as any)?.name === 'AbortError' || isTimeoutOrRateLimit(error);

      if ((is429 || isTimeout) && attempt < maxRetries - 1) {
        const waitMs = is429 ? 50000 : 15000; // 50s for rate limit, 15s for timeout
        console.warn(
          `[OPENAI] ⚠ ${is429 ? 'Rate limit' : 'Timeout'} (attempt ${attempt + 1}/${maxRetries}), waiting ${waitMs / 1000}s...`
        );
        await sleep(waitMs);
        continue;
      }

      if (isTimeout && attempt >= maxRetries - 1) {
        throw new Error('Translation timeout after 40% - possibly API rate limit or server timeout');
      }
      throw error;
    }
  }

  throw lastError ?? new Error('OpenAI failed after all retries');
}

async function translateWithAnthropic(prompt: string, model: string, maxTokens: number): Promise<string> {
  const apiKey = state.settings.anthropicKey;
  if (!apiKey) throw new Error('Anthropic API key not configured');

  const { anthropicChat } = await import('../ai/anthropic');
  const maxRetries = 6;
  let lastError: unknown;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const { text } = await anthropicChat({
        apiKey,
        model,
        user: prompt,
        maxTokens,
        temperature: 0.3
      });
      const result = text.trim();
      if (!result) throw new Error('Anthropic returned empty response');
      return result;
    } catch (error: unknown) {
      lastError = error;
      if (isTimeoutOrRateLimit(error) && attempt < maxRetries - 1) {
        await sleep(15000);
        continue;
      }
      throw error;
    }
  }

  throw lastError ?? new Error('Anthropic translation failed');
}

/**
 * Traduz usando Grok (xAI) com timeout
 */
async function translateWithGrok(prompt: string, model: string, maxTokens: number): Promise<string> {
  const apiKey = state.settings.xaiKey;
  if (!apiKey) throw new Error('xAI API key not configured');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: maxTokens
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Grok API error: ${error}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content?.trim() || '';
  } catch (err) {
    clearTimeout(timeoutId);
    if ((err as any)?.name === 'AbortError') {
      throw new Error('Translation timeout after 40% - possibly API rate limit or server timeout');
    }
    throw err;
  }
}
