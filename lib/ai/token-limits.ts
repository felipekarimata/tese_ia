/**
 * Configuração centralizada de limites de tokens para diferentes operações
 * 
 * LIMITES MÁXIMOS POR MODELO:
 * 
 * OpenAI:
 * - gpt-4o: 16,384 tokens de saída
 * - gpt-4o-mini: 16,384 tokens de saída
 * - gpt-4-turbo: 4,096 tokens de saída
 * - gpt-3.5-turbo: 4,096 tokens de saída
 * 
 * Gemini:
 * - gemini-2.0-flash-exp: 8,192 tokens de saída
 * - gemini-1.5-pro: 8,192 tokens de saída
 * - gemini-1.5-flash: 8,192 tokens de saída
 * 
 * Grok:
 * - grok-beta: 4,096 tokens de saída
 * 
 * NOTA: Aumentar tokens aumenta custos e tempo de resposta.
 * Use valores altos apenas quando necessário para respostas muito detalhadas.
 */

export const TOKEN_LIMITS = {
  // Operações de melhoria e análise
  improvement: {
    sectionAnalysis: 8000,      // Análise de seções individuais (era 4000)
    documentAnalysis: 4000,      // Análise global do documento (era 2000)
  },

  // Operações de tradução
  translation: {
    default: 16000,              // Tradução padrão (ajuste conforme necessário)
    chunkTranslation: 8000,      // Tradução de chunks individuais
  },

  // Operações de adaptação
  adaptation: {
    styleAdaptation: 8000,       // Adaptação de estilo (sem limite definido antes)
  },

  // Operações de ajuste
  adjustment: {
    customInstructions: 8000,    // Ajustes customizados (sem limite definido antes)
  },

  // Operações de atualização
  update: {
    normsUpdate: 8000,           // Atualização de normas (sem limite definido antes)
  },

  // Chat geral
  chat: {
    default: 4000,               // Chat padrão (era 2000)
    detailed: 8000,              // Respostas detalhadas
  },

  // Operações de pipeline
  pipeline: {
    operationResult: 8000,        // Resultados de operações do pipeline
  },
} as const;

/**
 * Obtém o limite de tokens para uma operação específica
 */
export function getTokenLimit(operation: keyof typeof TOKEN_LIMITS, subOperation?: string): number {
  const operationLimits = TOKEN_LIMITS[operation];
  
  if (subOperation && subOperation in operationLimits) {
    return (operationLimits as any)[subOperation];
  }
  
  // Retorna o primeiro valor disponível ou um padrão seguro
  const values = Object.values(operationLimits);
  return values[0] || 4000;
}

/**
 * Configuração de limites por modelo (para validação)
 */
export const MODEL_MAX_OUTPUT_TOKENS: Record<string, number> = {
  // OpenAI
  'gpt-5.4': 128000,
  'gpt-5.4-mini': 128000,
  'gpt-4o': 16384,
  'gpt-4o-mini': 16384,
  'gpt-4-turbo': 4096,
  'gpt-4': 4096,
  'gpt-3.5-turbo': 4096,

  // Gemini
  'gemini-3-flash-preview': 8192,
  'gemini-2.5-flash': 8192,
  'gemini-2.5-flash-lite': 8192,
  'gemini-2.5-pro': 8192,
  'gemini-2.0-flash-exp': 8192,
  'gemini-1.5-pro': 8192,
  'gemini-1.5-flash': 8192,
  'gemini-pro': 8192,

  // Grok
  'grok-beta': 4096,
  'grok-2': 4096,
  'grok-4-1-fast-non-reasoning': 8192,
  'grok-4-1-fast-reasoning': 8192,
  'grok-4.20-0309-non-reasoning': 8192,
};

/**
 * Valida e ajusta o limite de tokens para o modelo específico
 */
export function validateTokenLimit(model: string, requestedLimit: number): number {
  const modelMax = MODEL_MAX_OUTPUT_TOKENS[model];
  
  if (!modelMax) {
    // Se o modelo não está na lista, usa um limite conservador
    console.warn(`[TOKEN-LIMITS] Modelo desconhecido: ${model}, usando limite padrão de 4000`);
    return Math.min(requestedLimit, 4000);
  }
  
  if (requestedLimit > modelMax) {
    console.warn(
      `[TOKEN-LIMITS] Limite solicitado (${requestedLimit}) excede o máximo do modelo ${model} (${modelMax}). ` +
      `Usando ${modelMax} tokens.`
    );
    return modelMax;
  }
  
  return requestedLimit;
}
