/**
 * Adapt Operation Processor
 * Adapts documents to different styles and audiences
 */

import { AdaptationSuggestion } from './types';
import { extractDocumentStructure } from '@/lib/improvement/document-analyzer';
import { isGemini429, parseGeminiRetryDelayMs } from '@/lib/ai/gemini-retry';
import { isOpenAIGpt5Family } from '@/lib/ai/openai-compat';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { randomUUID } from 'crypto';

/**
 * Analyze document and generate adaptations based on style and audience
 */
export async function analyzeDocumentForAdaptation(
  documentPath: string,
  style: 'academic' | 'professional' | 'simplified' | 'custom',
  targetAudience: string | undefined,
  provider: 'openai' | 'gemini' | 'grok' | 'anthropic',
  model: string,
  apiKey: string,
  onProgress?: (currentSection: number, totalSections: number, currentBatch?: number, totalBatches?: number) => Promise<void>,
  onSavePartial?: (suggestions: AdaptationSuggestion[], currentSection: number, totalSections: number) => Promise<void>,
  /** Optional checkpoint that throws if the caller wants to abort.
   * Called between sections AND between batches inside each section so a
   * cancel request stops the next paid AI call. */
  cancelCheck?: () => void
): Promise<AdaptationSuggestion[]> {
  console.log('[ADAPT] Extracting document structure...');

  // Extract document structure
  const { structure, paragraphs } = await extractDocumentStructure(documentPath);

  console.log(`[ADAPT] Found ${paragraphs.length} paragraphs`);
  console.log(`[ADAPT] Style: ${style}, Target audience: ${targetAudience || 'general'}`);

  const allSuggestions: AdaptationSuggestion[] = [];

  // Process in batches
  const BATCH_SIZE = 15;

  for (let i = 0; i < structure.sections.length; i++) {
    cancelCheck?.();
    const section = structure.sections[i];
    const sectionParagraphs = paragraphs
      .slice(section.startParagraphIndex, section.endParagraphIndex + 1)
      .filter(p => !p.isHeader)
      .map(p => ({ text: p.text, index: p.index }));

    const sectionTitle = section.title.substring(0, 50);
    console.log(`[ADAPT] 📝 Analyzing section ${i + 1}/${structure.sections.length}: "${sectionTitle}" (${sectionParagraphs.length} paragraphs)`);

    // Calculate number of batches for this section
    const totalBatches = Math.ceil(sectionParagraphs.length / BATCH_SIZE);
    console.log(`[ADAPT]   → Processing ${totalBatches} batch(es) for this section`);

    // Process section in batches
    let batchIndex = 0;
    for (let batchStart = 0; batchStart < sectionParagraphs.length; batchStart += BATCH_SIZE) {
      cancelCheck?.();
      batchIndex++;
      const batchEnd = Math.min(batchStart + BATCH_SIZE, sectionParagraphs.length);
      const batch = sectionParagraphs.slice(batchStart, batchEnd);

      console.log(`[ADAPT]   → Batch ${batchIndex}/${totalBatches}: Processing paragraphs ${batchStart + 1}-${batchEnd} (${batch.length} paragraphs)`);

      const batchStartTime = Date.now();
      const suggestions = await analyzeBatch(
        batch,
        section.title,
        style,
        targetAudience,
        provider,
        model,
        apiKey,
        onSavePartial ? async () => {
          // Save partial progress before retry
          if (onSavePartial) {
            await onSavePartial(allSuggestions, i + 1, structure.sections.length);
          }
        } : undefined
      );
      const batchDuration = ((Date.now() - batchStartTime) / 1000).toFixed(1);

      console.log(`[ADAPT]   → Batch ${batchIndex}/${totalBatches} completed in ${batchDuration}s: Generated ${suggestions.length} suggestions`);

      allSuggestions.push(...suggestions);

      // Save partial progress after each successful batch
      if (onSavePartial) {
        await onSavePartial(allSuggestions, i + 1, structure.sections.length);
      }

      // Update progress
      if (onProgress) {
        await onProgress(i + 1, structure.sections.length, batchIndex, totalBatches);
      }
    }

    console.log(`[ADAPT] ✅ Section ${i + 1}/${structure.sections.length} completed: Total ${allSuggestions.length} suggestions so far`);
  }

  console.log(`[ADAPT] 🎉 Generated ${allSuggestions.length} adaptation suggestions total`);

  return allSuggestions;
}

/**
 * Check if an error is retryable (429, 500, 502, 503, 504, network errors)
 */
function isRetryableError(error: any): boolean {
  if (!error) return false;
  
  // Check for OpenAI/Grok rate limit or quota errors
  if (error.status === 429 || error.code === 'insufficient_quota' || error.code === 'rate_limit_exceeded') {
    return true;
  }
  // Gemini 429 (message-based)
  if (error.message?.includes('429') || error.message?.includes('quota') || error.message?.includes('Too Many Requests')) {
    return true;
  }
  
  // Check for server errors
  if (error.status >= 500 && error.status < 600) {
    return true;
  }
  
  // Check for network errors
  if (error.message?.includes('ECONNRESET') || error.message?.includes('ETIMEDOUT') || error.message?.includes('ENOTFOUND')) {
    return true;
  }
  
  return false;
}

/**
 * Analyze a batch of paragraphs for style adaptation with retry logic
 */
async function analyzeBatch(
  paragraphs: Array<{ text: string; index: number }>,
  sectionTitle: string,
  style: 'academic' | 'professional' | 'simplified' | 'custom',
  targetAudience: string | undefined,
  provider: 'openai' | 'gemini' | 'grok' | 'anthropic',
  model: string,
  apiKey: string,
  onSavePartial?: () => Promise<void>
): Promise<AdaptationSuggestion[]> {

  const prompt = buildPrompt(paragraphs, sectionTitle, style, targetAudience);
  const maxRetries = 3;
  const retryDelayMs = 60 * 1000; // 1 minute

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[ADAPT]     → Calling AI API (${provider}/${model}) for ${paragraphs.length} paragraphs...${attempt > 1 ? ` (Tentativa ${attempt}/${maxRetries})` : ''}`);

      let responseText: string;
      const apiStartTime = Date.now();

      if (provider === 'openai' || provider === 'grok') {
        const client = new OpenAI({
          apiKey,
          baseURL: provider === 'grok' ? 'https://api.x.ai/v1' : undefined
        });

        const response = await client.chat.completions.create({
          model,
          messages: [{ role: 'user', content: prompt }],
          ...(provider === 'grok' || !isOpenAIGpt5Family(model) ? { temperature: 0.3 } : {}),
          max_tokens: 12000, // Aumentado para permitir adaptações muito detalhadas
          response_format: { type: 'json_object' }
        });

        responseText = response.choices[0].message.content || '{}';
        const apiDuration = ((Date.now() - apiStartTime) / 1000).toFixed(1);
        console.log(`[ADAPT]     → AI API responded in ${apiDuration}s`);

      } else if (provider === 'anthropic') {
        const { anthropicChat } = await import('@/lib/ai/anthropic');
        const { text } = await anthropicChat({
          apiKey,
          model,
          system:
            'Responda apenas com um objeto JSON válido conforme o formato pedido. Sem markdown.',
          user: prompt,
          maxTokens: 12000,
          temperature: 0.3
        });
        responseText = text || '{}';
        const apiDuration = ((Date.now() - apiStartTime) / 1000).toFixed(1);
        console.log(`[ADAPT]     → AI API responded in ${apiDuration}s`);

      } else {
        // Gemini
        const genAI = new GoogleGenerativeAI(apiKey);
        const geminiModel = genAI.getGenerativeModel({ model });

        const result = await geminiModel.generateContent({
          contents: [{
            role: 'user',
            parts: [{ text: prompt }]
          }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 8192, // Aumentado para máximo do Gemini (permite adaptações muito detalhadas)
            responseMimeType: 'application/json'
          }
        });

        responseText = result.response.text();
        const apiDuration = ((Date.now() - apiStartTime) / 1000).toFixed(1);
        console.log(`[ADAPT]     → AI API responded in ${apiDuration}s`);
      }

      // Parse response
      console.log(`[ADAPT]     → Parsing AI response...`);
      try {
        const data = JSON.parse(responseText);
        const suggestions: AdaptationSuggestion[] = (data.suggestions || []).map((s: any) => ({
          id: randomUUID(),
          originalText: s.originalText || '',
          adaptedText: s.adaptedText || '',
          reason: s.reason || '',
          sectionTitle,
          adaptationType: s.adaptationType || 'style'
        }));

        console.log(`[ADAPT]     → Parsed ${suggestions.length} suggestions from AI response`);
        return suggestions;
      } catch (parseError) {
        console.error('[ADAPT] ❌ Failed to parse AI response:', parseError);
        console.error('[ADAPT] Response text (first 500 chars):', responseText.substring(0, 500));
        return [];
      }
      
    } catch (error: any) {
      const isRetryable = isRetryableError(error);
      
      if (isRetryable && attempt < maxRetries) {
        const delayMs = isGemini429(error) ? parseGeminiRetryDelayMs(error) : retryDelayMs;
        console.warn(`[ADAPT] ⚠️ Erro temporário na tentativa ${attempt}/${maxRetries}: ${error.message || error.code || 'Unknown error'}`);
        console.log(`[ADAPT]     → Aguardando ${(delayMs / 1000).toFixed(1)}s antes de tentar novamente...`);
        
        // Save partial progress before retry
        if (onSavePartial) {
          try {
            await onSavePartial();
            console.log(`[ADAPT]     → Progresso parcial salvo antes do retry`);
          } catch (saveError: any) {
            console.error(`[ADAPT]     → Erro ao salvar progresso parcial:`, saveError.message);
          }
        }
        
        // Wait before retry (use API-suggested delay for Gemini 429)
        await new Promise(resolve => setTimeout(resolve, delayMs));
        continue; // Try again
      } else {
        // Not retryable or max retries reached
        if (attempt >= maxRetries) {
          console.error(`[ADAPT] ❌ Falhou após ${maxRetries} tentativas: ${error.message || error.code || 'Unknown error'}`);
          console.error(`[ADAPT]     → Salvando progresso parcial e continuando...`);
          
          // Save partial progress before failing
          if (onSavePartial) {
            try {
              await onSavePartial();
              console.log(`[ADAPT]     → Progresso parcial salvo`);
            } catch (saveError: any) {
              console.error(`[ADAPT]     → Erro ao salvar progresso parcial:`, saveError.message);
            }
          }
          
          // Return empty array to continue with partial results
          return [];
        }
        
        // Non-retryable error, throw immediately
        throw error;
      }
    }
  }
  
  // Should never reach here, but just in case
  return [];
}

/**
 * Build prompt for style adaptation
 */
function buildPrompt(
  paragraphs: Array<{ text: string; index: number }>,
  sectionTitle: string,
  style: 'academic' | 'professional' | 'simplified' | 'custom',
  targetAudience: string | undefined
): string {
  const styleDescriptions = {
    academic: 'formal academic style with precise terminology, citations, and scholarly tone',
    professional: 'professional business style with clear, concise language suitable for corporate environments',
    simplified: 'simplified language accessible to general audiences, avoiding jargon and complex terms',
    custom: targetAudience || 'general audience'
  };

  const styleDescription = styleDescriptions[style];
  const audienceText = targetAudience ? ` for ${targetAudience}` : '';

  return `You are a document adaptation expert. Analyze the following text from section "${sectionTitle}" and suggest adaptations to ${styleDescription}${audienceText}.

For each paragraph that needs adaptation, provide:
- originalText: the exact original text (unchanged)
- adaptedText: the adapted version in the target style
- reason: brief explanation of the adaptation (why this change improves style/audience fit)
- adaptationType: one of: "style", "tone", "terminology", "structure"

Focus on paragraphs that would significantly benefit from adaptation. Skip paragraphs that are already appropriate for the target style.

Paragraphs to analyze:
${paragraphs.map((p, i) => `[${i + 1}] ${p.text}`).join('\n\n')}

Respond with ONLY a JSON object in this format:
{
  "suggestions": [
    {
      "originalText": "...",
      "adaptedText": "...",
      "reason": "...",
      "adaptationType": "..."
    }
  ]
}`;
}
