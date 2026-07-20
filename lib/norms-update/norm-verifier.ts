import { NormReference, NormStatus, UpdateType } from './types';
import { isGemini429, parseGeminiRetryDelayMs, sleep } from '@/lib/ai/gemini-retry';
import { isOpenAIGpt5Family } from '@/lib/ai/openai-compat';
import { verifyWithOfficialSources } from './sources/official-sources';

/**
 * Verifica o status de uma norma: primeiro fontes oficiais (LexML/Senado), depois IA (Gemini/OpenAI/Claude).
 * Esta função roda no SERVIDOR (API route)
 */
export async function verifyNormStatus(
  reference: NormReference,
  provider: 'openai' | 'gemini' | 'anthropic',
  model: string,
  apiKey: string,
  webSearchFn?: (query: string) => Promise<string> // Opcional - só para OpenAI
): Promise<NormReference> {

  console.log(`[NORMS] Verifying: ${reference.type} ${reference.number}`);

  try {
    // 1) Fontes oficiais (LexML, Senado) para leis/decretos/portarias/resoluções brasileiras
    const officialResult = await verifyWithOfficialSources(reference);
    if (officialResult) {
      return {
        ...reference,
        status: officialResult.status,
        updatedNumber: officialResult.updatedNumber,
        updatedDate: officialResult.updatedDate,
        updateDescription: officialResult.updateDescription,
        updateType: officialResult.updateType,
        sourceUrl: officialResult.sourceUrl,
        suggestedText: officialResult.suggestedText,
        confidence: officialResult.confidence,
        isPaid: false
      };
    }

    // 2) Fallback: IA (Gemini com Google Search, Claude com web search, ou OpenAI com webSearchFn)
    let searchResults = '';

    if (provider === 'openai' && webSearchFn) {
      const searchQuery = buildSearchQuery(reference);
      console.log(`[NORMS] Searching: ${searchQuery}`);
      searchResults = await webSearchFn(searchQuery);
    } else if (provider === 'gemini') {
      console.log(`[NORMS] Using Gemini with Google Search grounding`);
    } else if (provider === 'anthropic') {
      console.log(`[NORMS] Using Claude with Anthropic web search tool`);
    }

    const analysis = await analyzeSearchResults(
      reference,
      searchResults,
      provider,
      model,
      apiKey
    );

    return {
      ...reference,
      ...analysis
    };

  } catch (error: any) {
    console.error(`[NORMS] Error verifying ${reference.number}:`, {
      message: error.message,
      stack: error.stack,
      fullError: error
    });
    return {
      ...reference,
      status: 'desconhecido',
      updateType: 'manual',
      updateDescription: `Erro na verificação: ${error.message}`
    };
  }
}

/**
 * Constrói query de busca otimizada por tipo de norma
 */
function buildSearchQuery(reference: NormReference): string {
  const { type, number } = reference;

  switch (type) {
    case 'lei':
      return `Lei ${number} Brasil vigente revogada alterada site:planalto.gov.br OR site:gov.br`;

    case 'decreto':
      return `Decreto ${number} Brasil vigente revogada site:planalto.gov.br OR site:gov.br`;

    case 'portaria':
      return `Portaria ${number} Brasil vigente revogada site:gov.br`;

    case 'resolucao':
      return `Resolução ${number} vigente revogada site:gov.br`;

    case 'abnt':
      return `ABNT ${number} cancelada substituída atualizada site:abnt.org.br OR site:inmetro.gov.br`;

    case 'iso':
      return `ISO ${number} withdrawn superseded updated site:iso.org`;

    case 'regulamento':
      return `Regulamento ${number} vigente revogado`;

    default:
      return `${reference.fullText} vigente revogada atualizada`;
  }
}

/**
 * Analisa status da norma usando IA com web search
 */
async function analyzeSearchResults(
  reference: NormReference,
  searchResults: string,
  provider: 'openai' | 'gemini' | 'anthropic',
  model: string,
  apiKey: string
): Promise<Partial<NormReference>> {

  const isPaid = reference.type === 'abnt' || reference.type === 'iso';

  const webGrounded =
    provider === 'gemini' || provider === 'anthropic';
  const webHint =
    provider === 'gemini'
      ? 'Use Google Search para verificar'
      : provider === 'anthropic'
        ? 'Use a pesquisa na web (ferramenta disponível) para verificar'
        : 'Analise os resultados de busca abaixo e determine';

  // Para Gemini/Claude, pesquisa na web; para OpenAI, trechos de busca passados em searchResults
  const prompt = `Você é um especialista em análise de normas jurídicas e técnicas. ${webHint} o status da seguinte norma:

NORMA ANALISADA:
Tipo: ${reference.type}
Número: ${reference.number}
Texto: ${reference.fullText}

${webGrounded ? 'INSTRUÇÕES: Faça uma pesquisa na web para verificar o status atual desta norma. Procure em sites oficiais como planalto.gov.br, eur-lex.europa.eu, boe.es, abnt.org.br, iso.org, etc.' : `RESULTADOS DA BUSCA:\n---\n${searchResults.substring(0, 4000)}\n---`}

Determine:
1. STATUS atual da norma:
   - "vigente": Norma está em vigor sem alterações
   - "alterada": Norma está em vigor mas foi modificada/atualizada
   - "revogada": Norma foi revogada/cancelada
   - "substituida": Norma foi substituída por outra
   - "desconhecido": Não há informação suficiente

2. Se foi ALTERADA ou SUBSTITUÍDA:
   - Qual o número/identificação da nova versão?
   - Quando foi alterada/substituída?
   - Breve descrição da mudança

3. TIPO DE ATUALIZAÇÃO necessária (OBRIGATÓRIO - escolha um):
   - "auto": Pode atualizar automaticamente (leis/decretos públicos revogadas ou substituídas)
   - "manual": Requer verificação manual (normas ABNT/ISO pagas OU não há info suficiente)
   - "none": Não precisa atualização (norma está vigente sem alterações)

4. Se possível ATUALIZAR AUTOMATICAMENTE:
   - Sugira o texto atualizado para substituir no documento
   - Ex: "Lei nº 8.078/1990 (alterada pela Lei 14.181/2021)"

IMPORTANTE:
- Normas ABNT/ISO são PAGAS → sempre "manual"
- Leis/Decretos brasileiros são PÚBLICOS → pode ser "auto"
- Se não tiver certeza, marque como "desconhecido"
- URL oficial da fonte (se disponível)

FORMATO DA RESPOSTA:
Retorne APENAS um objeto JSON válido, sem markdown, sem explicações, sem texto adicional.
Comece sua resposta com { e termine com }

JSON:
{
  "status": "vigente|alterada|revogada|substituida|desconhecido",
  "updatedNumber": "número da versão atualizada (se houver)",
  "updatedDate": "data da atualização (se disponível)",
  "updateDescription": "descrição breve da mudança",
  "updateType": "auto|manual|none",
  "sourceUrl": "URL oficial da fonte",
  "isPaid": ${isPaid},
  "suggestedText": "texto sugerido para substituição (se updateType = auto)",
  "confidence": 0.95
}`;

  let response: string;

  if (provider === 'openai') {
    const OpenAI = (await import('openai')).default;
    const openai = new OpenAI({ apiKey });

    const completion = await openai.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      ...(isOpenAIGpt5Family(model) ? {} : { temperature: 0.2 }),
      max_tokens: 8000, // Aumentado para permitir verificações muito detalhadas
      response_format: { type: 'json_object' }
    });

    response = completion.choices[0]?.message?.content?.trim() || '{}';
  } else if (provider === 'anthropic') {
    const { anthropicChatWithWebSearch } = await import('@/lib/ai/anthropic');
    const system =
      'Você segue instruções com precisão. Ao final, responda APENAS com um objeto JSON válido conforme o formato pedido no enunciado, sem markdown.';
    const { text } = await anthropicChatWithWebSearch({
      apiKey,
      model,
      system,
      user: prompt,
      maxTokens: 8000,
      maxWebUses: 10
    });
    response = text || '{}';
  } else {
    // Gemini com Google Search (grounding), com retry em 429
    const groundingModel =
      model === 'gemini-flash-latest' || /^gemini-3/i.test(model)
        ? 'gemini-2.5-flash'
        : model;
    console.log(`[NORMS] Initializing Gemini with model: ${groundingModel} (original: ${model})`);

    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const geminiModel = genAI.getGenerativeModel({
      model: groundingModel,
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 8192
      },
      tools: [{ google_search: {} }]
    });

    const maxRetries = 4;
    let lastErr: any;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[NORMS] Calling Gemini API with Google Search for ${reference.number}...`);
        const result = await geminiModel.generateContent(prompt);
        console.log(`[NORMS] Gemini API response received for ${reference.number}`);
        response = result.response.text().trim();
        console.log(`[NORMS] Parsed text response:`, response);
        lastErr = undefined;
        break;
      } catch (geminiError: any) {
        lastErr = geminiError;
        console.error(`[NORMS] Gemini API Error for ${reference.number}:`, geminiError.message);
        if (isGemini429(geminiError) && attempt < maxRetries) {
          const delayMs = parseGeminiRetryDelayMs(geminiError);
          console.warn(`[NORMS] Gemini 429 (tentativa ${attempt}/${maxRetries}), aguardando ${(delayMs / 1000).toFixed(1)}s...`);
          await sleep(delayMs);
        } else {
          throw geminiError;
        }
      }
    }
    if (lastErr) throw lastErr;
  }

  // Parse JSON - tenta múltiplas estratégias
  console.log(`[NORMS] Parsing JSON response for ${reference.number}...`);

  // Estratégia 1: Remove markdown code blocks (```json ... ```)
  let cleanedResponse = response.replace(/```json\s*/g, '').replace(/```\s*/g, '');

  // Estratégia 2: Procura por { ... } no texto
  const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);

  if (!jsonMatch) {
    console.warn(`[NORMS] No JSON found in response for ${reference.number}.`);
    console.warn(`[NORMS] Raw response (first 500 chars):`, response.substring(0, 500));
    return {
      status: 'desconhecido',
      updateType: 'manual',
      updateDescription: 'Resposta da IA não contém JSON válido',
      isPaid
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonMatch[0]);
    console.log(`[NORMS] Parsed JSON for ${reference.number}:`, parsed);
  } catch (parseError: any) {
    console.error(`[NORMS] JSON parse error for ${reference.number}:`, parseError.message);
    console.error(`[NORMS] JSON string attempted:`, jsonMatch[0].substring(0, 200));
    return {
      status: 'desconhecido',
      updateType: 'manual',
      updateDescription: 'Erro ao fazer parse do JSON retornado pela IA',
      isPaid
    };
  }

  // Valida e corrige updateType
  let updateType: UpdateType = parsed.updateType as UpdateType;

  // Se retornou "desconhecido" ou valor inválido, mapeia para "manual"
  if (!updateType || !['auto', 'manual', 'none'].includes(updateType)) {
    console.warn(`[NORMS] Invalid updateType "${updateType}" for ${reference.number}, defaulting to "manual"`);
    updateType = 'manual';
  }

  // Se status é desconhecido, updateType deve ser manual
  if (parsed.status === 'desconhecido' && updateType !== 'manual') {
    console.warn(`[NORMS] Status is "desconhecido" but updateType is "${updateType}", correcting to "manual"`);
    updateType = 'manual';
  }

  const result = {
    status: parsed.status as NormStatus || 'desconhecido',
    updatedNumber: parsed.updatedNumber,
    updatedDate: parsed.updatedDate,
    updateDescription: parsed.updateDescription,
    updateType,
    sourceUrl: parsed.sourceUrl,
    isPaid: parsed.isPaid || isPaid,
    suggestedText: parsed.suggestedText,
    confidence: parsed.confidence || 0.5
  };

  console.log(`[NORMS] Verification result for ${reference.number}:`, result);
  return result;
}

/**
 * Verifica múltiplas normas em paralelo (com rate limiting)
 */
export async function verifyMultipleNorms(
  references: NormReference[],
  provider: 'openai' | 'gemini' | 'anthropic',
  model: string,
  apiKey: string,
  webSearchFn?: (query: string) => Promise<string>,
  onProgress?: (current: number, total: number) => void
): Promise<NormReference[]> {

  const results: NormReference[] = [];
  const batchSize = 2; // Processa 2 por vez (Gemini tem rate limit)

  for (let i = 0; i < references.length; i += batchSize) {
    const batch = references.slice(i, i + batchSize);

    const batchResults = await Promise.all(
      batch.map(ref => verifyNormStatus(ref, provider, model, apiKey, webSearchFn))
    );

    results.push(...batchResults);

    if (onProgress) {
      onProgress(Math.min(i + batchSize, references.length), references.length);
    }

    // Pequeno delay entre batches
    if (i + batchSize < references.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  return results;
}
