-- ================================================
-- SCHEMA COMPLETO DO SUPABASE PARA PROJETO AUTORIA
-- ================================================
-- Execute este SQL no Supabase SQL Editor
-- https://supabase.com/dashboard/project/_/sql

-- IMPORTANTE: Se já executou antes e deu erro, execute este DROP primeiro:
-- DROP TABLE IF EXISTS translation_jobs CASCADE;
-- DROP TABLE IF EXISTS documents CASCADE;
-- DROP TABLE IF EXISTS projects CASCADE;
-- DROP TABLE IF EXISTS settings CASCADE;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ================================================
-- TABELA: projects
-- ================================================
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index para busca rápida por data
CREATE INDEX idx_projects_updated_at ON projects(updated_at DESC);

-- ================================================
-- TABELA: documents
-- ================================================
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  pages INTEGER NOT NULL DEFAULT 0,
  file_path TEXT NOT NULL, -- Caminho no Supabase Storage
  chunks_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes para busca e relacionamento
CREATE INDEX idx_documents_project_id ON documents(project_id);
CREATE INDEX idx_documents_created_at ON documents(created_at DESC);

-- ================================================
-- TABELA: translation_jobs
-- ================================================
CREATE TABLE IF NOT EXISTS translation_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  target_language TEXT NOT NULL,
  source_language TEXT,
  provider TEXT NOT NULL, -- 'openai', 'gemini', 'grok'
  model TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'translating', 'completed', 'error'
  progress_percentage INTEGER NOT NULL DEFAULT 0,
  current_chunk INTEGER NOT NULL DEFAULT 0,
  total_chunks INTEGER NOT NULL DEFAULT 0,
  current_section TEXT,
  error_message TEXT,
  output_path TEXT, -- Caminho no Supabase Storage quando concluído
  stats JSONB, -- Estatísticas de validação
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Indexes para busca e relacionamento
CREATE INDEX idx_translation_jobs_document_id ON translation_jobs(document_id);
CREATE INDEX idx_translation_jobs_status ON translation_jobs(status);
CREATE INDEX idx_translation_jobs_created_at ON translation_jobs(created_at DESC);

-- ================================================
-- TABELA: settings (configurações globais)
-- ================================================
CREATE TABLE IF NOT EXISTS settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  openai_key TEXT,
  google_key TEXT,
  xai_key TEXT,
  models JSONB NOT NULL DEFAULT '{"openai": ["gpt-5.4-mini", "gpt-5.4"], "gemini": ["gemini-3-flash-preview", "gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.5-flash-lite"], "grok": ["grok-4-1-fast-non-reasoning", "grok-4-1-fast-reasoning", "grok-4.20-0309-non-reasoning"], "anthropic": ["claude-sonnet-4-6", "claude-opus-4-6", "claude-haiku-4-5"]}',
  prices_usd JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Garante que há apenas uma linha de settings
CREATE UNIQUE INDEX idx_settings_singleton ON settings ((id IS NOT NULL));

-- Insere configuração padrão se não existir
INSERT INTO settings (id, models, prices_usd)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  '{"openai": ["gpt-5.4-mini", "gpt-5.4"], "gemini": ["gemini-3-flash-preview", "gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.5-flash-lite"], "grok": ["grok-4-1-fast-non-reasoning", "grok-4-1-fast-reasoning", "grok-4.20-0309-non-reasoning"], "anthropic": ["claude-sonnet-4-6", "claude-opus-4-6", "claude-haiku-4-5"]}',
  '{
    "gpt-5.4": {"in": 0.0025, "out": 0.015},
    "gpt-5.4-mini": {"in": 0.00075, "out": 0.0045},
    "gpt-4o-mini": {"in": 0.00015, "out": 0.0006},
    "gpt-4o": {"in": 0.005, "out": 0.015},
    "gemini-3-flash-preview": {"in": 0.000075, "out": 0.0003},
    "gemini-2.5-flash": {"in": 0.000075, "out": 0.0003},
    "gemini-2.5-flash-lite": {"in": 0.00005, "out": 0.0002},
    "gemini-2.5-pro": {"in": 0.00125, "out": 0.005},
    "gemini-2.0-flash": {"in": 0.000075, "out": 0.0003},
    "grok-4-1-fast-non-reasoning": {"in": 0.0002, "out": 0.0005},
    "grok-4-1-fast-reasoning": {"in": 0.0002, "out": 0.0005},
    "grok-4.20-0309-non-reasoning": {"in": 0.002, "out": 0.006},
    "grok-2-1212": {"in": 0.002, "out": 0.01},
    "grok-2-vision-1212": {"in": 0.002, "out": 0.01},
    "claude-sonnet-4-6": {"in": 0.003, "out": 0.015},
    "claude-opus-4-6": {"in": 0.005, "out": 0.025},
    "claude-haiku-4-5": {"in": 0.001, "out": 0.005}
  }'
)
ON CONFLICT DO NOTHING;

-- ================================================
-- ROW LEVEL SECURITY (RLS)
-- ================================================
-- Por enquanto, desabilitamos RLS pois não temos autenticação
-- Quando implementar auth, habilite RLS e crie policies

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE translation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Policy temporária: permite tudo (REMOVER EM PRODUÇÃO)
CREATE POLICY "Enable all access for now" ON projects FOR ALL USING (true);
CREATE POLICY "Enable all access for now" ON documents FOR ALL USING (true);
CREATE POLICY "Enable all access for now" ON translation_jobs FOR ALL USING (true);
CREATE POLICY "Enable all access for now" ON settings FOR ALL USING (true);

-- ================================================
-- TRIGGERS: Auto-update de updated_at
-- ================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_translation_jobs_updated_at
  BEFORE UPDATE ON translation_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_settings_updated_at
  BEFORE UPDATE ON settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ================================================
-- STORAGE: Buckets para arquivos
-- ================================================
-- Execute no Supabase Dashboard > Storage > Create bucket
-- Bucket: "documents" (public: false)
-- Bucket: "translations" (public: false)

-- Ou execute via SQL:
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('documents', 'documents', false),
  ('translations', 'translations', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies (permite tudo por enquanto)
CREATE POLICY "Enable all access for documents bucket"
ON storage.objects FOR ALL
USING (bucket_id = 'documents');

CREATE POLICY "Enable all access for translations bucket"
ON storage.objects FOR ALL
USING (bucket_id = 'translations');
