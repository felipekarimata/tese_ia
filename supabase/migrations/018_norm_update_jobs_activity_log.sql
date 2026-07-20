-- Log de atividade visível ao usuário durante análise de normas
ALTER TABLE norm_update_jobs
ADD COLUMN IF NOT EXISTS activity_log JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN norm_update_jobs.activity_log IS 'Array de { at, level?, message } para exibir progresso na UI';
