import { NormReference, NormStatus, UpdateType } from './types';
import type { AIProvider } from '@/lib/ai/types';
import {
  formatResearchEvidence,
  generateStructuredJson,
  normalizeSources,
  researchWithWebSearch,
  type ResearchResult
} from '@/lib/ai/research';
import { verifyWithOfficialSources } from './sources/official-sources';

/**
 * Verifica o status de uma norma: primeiro fontes oficiais (LexML/Senado), depois IA (Gemini/OpenAI/Claude).
 * Esta função roda no SERVIDOR (API route)
 */
export async function verifyNormStatus(
  reference: NormReference,
  provider: AIProvider,
  model: string,
  apiKey: string
): Promise<NormReference> {

  console.log(`[NORMS] Verifying: ${reference.type} ${reference.number}`);

  try {
    // 1) Fontes oficiais (LexML, Senado) para leis/decretos/portarias/resoluções brasileiras
    const officialResult = await verifyWithOfficialSources(reference);
    if (officialResult) {
      const officialEvidence = normalizeSources(officialResult.sourceUrl ? [{
        title: 'Fonte oficial',
        url: officialResult.sourceUrl
      }] : []);
      return {
        ...reference,
        status: officialResult.status,
        updatedNumber: officialResult.updatedNumber,
        updatedDate: officialResult.updatedDate,
        updateDescription: officialResult.updateDescription,
        updateType: officialResult.updateType,
        sourceUrl: officialResult.sourceUrl,
        evidence: officialEvidence,
        sourceIds: officialEvidence.map(source => source.id),
        suggestedText: officialResult.suggestedText,
        confidence: officialResult.confidence,
        isPaid: false
      };
    }

    // 2) Fallback: todos os provedores fazem pesquisa web real e devolvem fontes auditáveis.
    const searchQuery = buildSearchQuery(reference);
    console.log(`[NORMS] Searching with ${provider}: ${searchQuery}`);
    const research = await researchWithWebSearch({
      provider,
      model,
      apiKey,
      topic: searchQuery,
      context: `${reference.fullText}\n\nContexto no documento: ${reference.context}`,
      depth: 'quick',
      preferredDomains: ['planalto.gov.br', 'gov.br', 'lexml.gov.br', 'senado.leg.br', 'abnt.org.br', 'iso.org']
    });

    const analysis = await analyzeSearchResults(
      reference,
      research,
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
  research: ResearchResult,
  provider: AIProvider,
  model: string,
  apiKey: string
): Promise<Partial<NormReference>> {

  const isPaid = reference.type === 'abnt' || reference.type === 'iso';

  const prompt = `Você é um especialista em análise de normas jurídicas e técnicas. Determine o status da norma usando exclusivamente a evidência pesquisada abaixo:

NORMA ANALISADA:
Tipo: ${reference.type}
Número: ${reference.number}
Texto: ${reference.fullText}

SÍNTESE DA PESQUISA:
${research.text.substring(0, 8000)}

FONTES VERIFICÁVEIS:
${formatResearchEvidence(research.sources)}

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
- Indique em "sourceIds" apenas IDs da lista de fontes acima; nunca invente URLs
- Sem evidência suficiente, use status "desconhecido", updateType "manual" e confiança baixa

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
  "sourceIds": ["S1", "S2"],
  "isPaid": ${isPaid},
  "suggestedText": "texto sugerido para substituição (se updateType = auto)",
  "confidence": 0.95
}`;

  const response = await generateStructuredJson({
    provider,
    model,
    apiKey,
    system: 'Responda apenas com JSON válido. Use somente os IDs das fontes fornecidas.',
    prompt,
    maxTokens: 8000
  });

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

  const validSourceIds = Array.isArray(parsed.sourceIds)
    ? parsed.sourceIds.filter((id: unknown): id is string => typeof id === 'string' && research.sources.some(source => source.id === id))
    : [];
  const citedSources = research.sources.filter(source => validSourceIds.includes(source.id));
  const result = {
    status: parsed.status as NormStatus || 'desconhecido',
    updatedNumber: parsed.updatedNumber,
    updatedDate: parsed.updatedDate,
    updateDescription: parsed.updateDescription,
    updateType,
    sourceUrl: citedSources[0]?.url,
    evidence: research.sources,
    sourceIds: validSourceIds,
    researchQueries: research.queries,
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
  provider: AIProvider,
  model: string,
  apiKey: string,
  _legacyWebSearchFn?: ((query: string) => Promise<string>) | undefined,
  onProgress?: (current: number, total: number) => void
): Promise<NormReference[]> {

  const results: NormReference[] = [];
  const batchSize = 2; // Processa 2 por vez (Gemini tem rate limit)

  for (let i = 0; i < references.length; i += batchSize) {
    const batch = references.slice(i, i + batchSize);

    const batchResults = await Promise.all(
      batch.map(ref => verifyNormStatus(ref, provider, model, apiKey))
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
