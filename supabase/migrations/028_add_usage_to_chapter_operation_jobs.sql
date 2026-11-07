-- ============================================================================
-- MIGRATION: Usage/cost tracking em chapter_operation_jobs
-- Description: Persiste nº de chamadas de IA, tokens e custo por job, para
--              habilitar budget por capítulo e auditoria de custo.
-- ============================================================================

ALTER TABLE chapter_operation_jobs
  ADD COLUMN IF NOT EXISTS ai_calls_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tokens_in BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tokens_out BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_usd NUMERIC(12, 6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS model TEXT;

-- Índice para somar custo por capítulo rapidamente (enforcement do budget).
CREATE INDEX IF NOT EXISTS idx_chapter_operation_jobs_chapter_cost
  ON chapter_operation_jobs(chapter_id);
