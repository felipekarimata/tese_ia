/**
 * Pipeline System Types
 * Defines all types for the document processing pipeline
 */

// ============================================
// Operation Types
// ============================================

export type PipelineOperation = 'adjust' | 'update' | 'improve' | 'adapt' | 'translate';

export type PipelineStatus =
  | 'pending'
  | 'running'
  | 'paused'
  | 'awaiting_approval'  // NEW: Waiting for user to review/approve
  | 'applying_changes'   // NEW: Applying approved changes
  | 'completed'
  | 'failed'
  | 'cancelled';

// ============================================
// Operation Configurations
// ============================================

export interface AdjustConfig {
  instructions: string;
  creativity: number; // 0-10
  provider: 'openai' | 'gemini' | 'grok' | 'anthropic';
  model: string;
}

export interface UpdateConfig {
  provider: 'openai' | 'gemini' | 'anthropic';
  model: string;
  /** Priorizar LexML/Senado/Data.gov.br antes de usar IA (recomendado). */
  useOfficialSources?: boolean;
}

export interface ImproveConfig {
  provider: 'openai' | 'gemini' | 'anthropic';
  model: string;
}

export interface AdaptConfig {
  style: 'academic' | 'professional' | 'simplified' | 'custom';
  targetAudience?: string;
  provider: 'openai' | 'gemini' | 'grok' | 'anthropic';
  model: string;
}

export interface TranslateConfig {
  sourceLanguage?: string;
  targetLanguage: string;
  provider: 'openai' | 'gemini' | 'grok' | 'anthropic';
  model: string;
  maxPages?: number;
}

// Union type for all operation configs
export type OperationConfig =
  | AdjustConfig
  | UpdateConfig
  | ImproveConfig
  | AdaptConfig
  | TranslateConfig;

// Map of operation name to its config
export type OperationConfigs = {
  adjust?: AdjustConfig;
  update?: UpdateConfig;
  improve?: ImproveConfig;
  adapt?: AdaptConfig;
  translate?: TranslateConfig;
};

// ============================================
// Operation Results
// ============================================

export interface OperationResult {
  operation: PipelineOperation;
  operationIndex: number;
  status: 'completed' | 'failed' | 'awaiting_approval';

  // Output document
  outputDocumentPath: string;
  outputDocumentSize?: number;

  // Operation-specific job ID (for linking to detailed results)
  operationJobId?: string;

  // Approval tracking (NEW)
  requiresApproval?: boolean;
  approvalStatus?: 'pending' | 'approved' | 'rejected';
  approvedItems?: string[]; // IDs of approved items (suggestions, norms, etc)

  // Metadata specific to each operation
  metadata: {
    duration_seconds?: number;
    cost_usd?: number;
    items_processed?: number; // suggestions, norms, paragraphs, etc
    items_generated?: number; // Total items for approval
    error_message?: string;
    [key: string]: any;
  };

  completedAt: string;
}

// ============================================
// Pipeline Job
// ============================================

export interface PipelineJob {
  id: string;
  document_id: string;

  // Configuration
  selected_operations: PipelineOperation[];
  operation_configs: OperationConfigs;

  // Execution state
  status: PipelineStatus;
  current_operation_index: number;

  // Results
  operation_results: OperationResult[];
  final_document_id?: string;
  final_document_path?: string;

  // Metadata
  error_message?: string;
  total_cost_usd: number;
  total_duration_seconds?: number;

  // Timestamps
  created_at: string;
  started_at?: string;
  completed_at?: string;

  // Audit
  created_by?: string;
}

// ============================================
// Intermediate Documents
// ============================================

export interface PipelineIntermediateDocument {
  id: string;
  pipeline_job_id: string;

  operation_name: PipelineOperation;
  operation_index: number;

  storage_path: string;
  file_size_bytes?: number;

  operation_job_id?: string;
  metadata: Record<string, any>;

  created_at: string;
}

// ============================================
// API Request/Response Types
// ============================================

export interface CreatePipelineRequest {
  documentId: string;
  operations: PipelineOperation[];
  configs: OperationConfigs;
}

export interface CreatePipelineResponse {
  jobId: string;
  message: string;
}

export interface PipelineStatusResponse {
  job: PipelineJob;
  intermediateDocuments: PipelineIntermediateDocument[];
  currentOperationProgress?: {
    operation: PipelineOperation;
    percentage: number;
    message?: string;
  };
}

// ============================================
// Pipeline Execution Context
// ============================================

export interface PipelineExecutionContext {
  pipelineJobId: string;
  documentId: string;
  currentOperation: PipelineOperation;
  currentOperationIndex: number;
  sourceDocumentPath: string;
  config: OperationConfig;
}

// ============================================
// Operation Executor Interface
// ============================================

export interface OperationExecutor {
  execute(context: PipelineExecutionContext): Promise<OperationResult>;
}

// ============================================
// Pipeline Templates (Future feature)
// ============================================

export interface PipelineTemplate {
  id: string;
  name: string;
  description: string;
  operations: PipelineOperation[];
  default_configs: Partial<OperationConfigs>;
  created_by: string;
  created_at: string;
  usage_count: number;
}

// ============================================
// Utility Types
// ============================================

export const OPERATION_METADATA = {
  adjust: {
    name: 'Ajuste livre',
    description: 'Alterar o texto conforme suas instruções (prompt)',
    icon: '⚙️',
    color: 'red',
    estimatedMinutes: 3
  },
  update: {
    name: 'Atualizar',
    description: 'Atualizar normas, leis e regulamentos',
    icon: '🔄',
    color: 'blue',
    estimatedMinutes: 5
  },
  improve: {
    name: 'Sugerir',
    description: 'Sugerir melhorias de escrita e clareza',
    icon: '✨',
    color: 'green',
    estimatedMinutes: 4
  },
  adapt: {
    name: 'Adaptar texto',
    description: 'Adaptar estilo e tom do texto ao público desejado',
    icon: '📐',
    color: 'purple',
    estimatedMinutes: 3
  },
  translate: {
    name: 'Traduzir',
    description: 'Traduzir para outro idioma',
    icon: '🌐',
    color: 'yellow',
    estimatedMinutes: 6
  }
} as const;

export type OperationMetadata = typeof OPERATION_METADATA[keyof typeof OPERATION_METADATA];
