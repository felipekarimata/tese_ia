export type NormType = 'lei' | 'decreto' | 'portaria' | 'resolucao' | 'abnt' | 'iso' | 'regulamento' | 'outro';

export type NormStatus =
  | 'vigente'           // Norma está válida
  | 'alterada'          // Norma válida mas foi alterada
  | 'revogada'          // Norma foi revogada/cancelada
  | 'substituida'       // Norma foi substituída por outra
  | 'desconhecido';     // Não foi possível verificar

export type UpdateType =
  | 'auto'              // Pode atualizar automaticamente (norma pública)
  | 'manual'            // Requer verificação manual (norma paga)
  | 'none';             // Não precisa atualização

export type NormReference = {
  id: string;                    // UUID único
  type: NormType;                // Tipo da norma
  number: string;                // Ex: "8.078/1990", "NBR 14724:2011"
  fullText: string;              // Texto completo como aparece no documento
  context: string;               // Contexto ao redor (para localizar)
  paragraphIndex: number;        // Índice do parágrafo
  chapterTitle?: string;         // Capítulo onde aparece

  // Informações de status (preenchido após verificação)
  status?: NormStatus;
  updatedNumber?: string;        // Número da norma atualizada
  updatedDate?: string;          // Data da atualização
  updateDescription?: string;    // Descrição da mudança
  updateType?: UpdateType;       // Tipo de atualização necessária
  sourceUrl?: string;            // URL da fonte oficial
  isPaid?: boolean;              // Se é norma paga (ABNT/ISO)

  // Para atualização automática
  suggestedText?: string;        // Texto sugerido para substituição
  confidence?: number;           // Confiança na sugestão (0-1)
};

export type NormUpdateJob = {
  id: string;
  document_id: string;
  status: 'pending' | 'analyzing' | 'completed' | 'error';

  norm_references: NormReference[];   // Todas as referências encontradas

  // Estatísticas
  total_references: number;
  vigentes: number;
  alteradas: number;
  revogadas: number;
  substituidas: number;
  manual_review: number;         // Normas que precisam revisão manual

  current_reference: number;     // Referência atual sendo verificada
  progress_percentage: number;

  error_message?: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
};

export type NormUpdateOptions = {
  provider: 'openai' | 'gemini' | 'anthropic';
  model: string;
  onProgress?: (progress: {
    current: number;
    total: number;
    percentage: number;
  }) => void;
  onLog?: (message: string) => void;
};
