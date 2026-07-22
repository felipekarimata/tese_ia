# Documentação de Setup do Supabase - Projeto Tese

> Documentação completa para migração de desenvolvedor e configuração do banco de dados Supabase

## Índice

1. [Visão Geral](#visão-geral)
2. [Extensões PostgreSQL](#extensões-postgresql)
3. [Tabelas do Sistema](#tabelas-do-sistema)
4. [Funções e Stored Procedures](#funções-e-stored-procedures)
5. [Políticas RLS (Row Level Security)](#políticas-rls-row-level-security)
6. [Storage Buckets](#storage-buckets)
7. [Views](#views)
8. [Triggers](#triggers)
9. [Ordem de Execução das Migrations](#ordem-de-execução-das-migrations)
10. [Verificação Pós-Instalação](#verificação-pós-instalação)

---

## Visão Geral

Este projeto utiliza **Supabase** como backend, contendo:
- Sistema de projetos e documentos
- Sistema de teses com capítulos versionados
- Jobs de tradução, melhoria e atualização de normas
- Pipeline de processamento de documentos
- Sistema de referências para operações

---

## Extensões PostgreSQL

### UUID Extension

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

**Descrição**: Habilita a geração de UUIDs usando `uuid_generate_v4()` e `gen_random_uuid()`.

---

## Tabelas do Sistema

### 1. **projects**

Tabela principal para projetos de autoria.

```sql
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Índices:**
- `idx_projects_updated_at` - Busca rápida por data de atualização

---

### 2. **documents**

Documentos associados a projetos.

```sql
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  pages INTEGER NOT NULL DEFAULT 0,
  file_path TEXT NOT NULL,
  chunks_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Índices:**
- `idx_documents_project_id` - Relacionamento com projetos
- `idx_documents_created_at` - Busca por data de criação

**Relações:**
- `project_id` → `projects.id` (SET NULL on delete)

---

### 3. **translation_jobs**

Jobs de tradução de documentos.

```sql
CREATE TABLE IF NOT EXISTS translation_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  target_language TEXT NOT NULL,
  source_language TEXT,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  progress_percentage INTEGER NOT NULL DEFAULT 0,
  current_chunk INTEGER NOT NULL DEFAULT 0,
  total_chunks INTEGER NOT NULL DEFAULT 0,
  current_section TEXT,
  error_message TEXT,
  output_path TEXT,
  stats JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
```

**Status possíveis:** `pending`, `translating`, `completed`, `error`

**Providers:** `openai`, `gemini`, `grok`

**Índices:**
- `idx_translation_jobs_document_id`
- `idx_translation_jobs_status`
- `idx_translation_jobs_created_at`

---

### 4. **settings**

Configurações globais do sistema (singleton).

```sql
CREATE TABLE IF NOT EXISTS settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  openai_key TEXT,
  google_key TEXT,
  xai_key TEXT,
  models JSONB NOT NULL DEFAULT '{"openai": [...], "gemini": [...], "grok": [...]}',
  prices_usd JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Nota:** Esta tabela contém apenas 1 registro com `id = '00000000-0000-0000-0000-000000000001'`

**Índice único:** `idx_settings_singleton`

---

### 5. **theses**

Container principal para projetos de tese/dissertação.

```sql
CREATE TABLE IF NOT EXISTS theses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Índices:**
- `idx_theses_created_at`

---

### 6. **chapters**

Capítulos de uma tese, com ordenação.

```sql
CREATE TABLE IF NOT EXISTS chapters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thesis_id UUID NOT NULL REFERENCES theses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  chapter_order INTEGER NOT NULL,
  current_version_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(thesis_id, chapter_order),
  UNIQUE(thesis_id, title)
);
```

**Constraints:**
- Ordem única por tese
- Título único por tese

**Índices:**
- `idx_chapters_thesis_id`
- `idx_chapters_order`

**Relações:**
- `current_version_id` → `chapter_versions.id` (circular FK, criado posteriormente)

---

### 7. **chapter_versions**

Histórico de versões de cada capítulo.

```sql
CREATE TABLE IF NOT EXISTS chapter_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id UUID NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  parent_version_id UUID REFERENCES chapter_versions(id) ON DELETE SET NULL,
  file_path TEXT NOT NULL,
  pages INTEGER,
  chunks_count INTEGER,
  created_by_operation TEXT NOT NULL DEFAULT 'upload',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(chapter_id, version_number)
);
```

**Operações possíveis:** `upload`, `improve`, `translate`, `adjust`, `adapt`, `update`

**Índices:**
- `idx_chapter_versions_chapter_id`
- `idx_chapter_versions_version_number`
- `idx_chapter_versions_parent`

---

### 8. **chapter_chunks**

Chunks de texto para RAG (Retrieval-Augmented Generation).

```sql
CREATE TABLE IF NOT EXISTS chapter_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_version_id UUID NOT NULL REFERENCES chapter_versions(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  page_from INTEGER NOT NULL,
  page_to INTEGER NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(chapter_version_id, chunk_index)
);
```

**Índices:**
- `idx_chapter_chunks_version_id`
- `idx_chapter_chunks_chunk_index`
- `idx_chapter_chunks_text_search` (GIN para full-text search em português)

---

### 9. **thesis_versions**

Versões compiladas/mescladas de teses completas.

```sql
CREATE TABLE thesis_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thesis_id UUID NOT NULL REFERENCES theses(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  total_pages INTEGER,
  chapters_included JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(thesis_id, version_number)
);
```

**Índices:**
- `idx_thesis_versions_thesis_id`
- `idx_thesis_versions_version_number`

---

### 10. **chapter_operation_jobs**

Jobs de operações em capítulos (melhorias, traduções, ajustes, etc).

```sql
CREATE TABLE IF NOT EXISTS chapter_operation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id UUID NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  version_id UUID NOT NULL REFERENCES chapter_versions(id) ON DELETE CASCADE,
  operation TEXT NOT NULL CHECK (operation IN ('improve', 'translate', 'adjust', 'adapt', 'update')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'error')),
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  error_message TEXT,
  new_version_id UUID REFERENCES chapter_versions(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
```

**Índices:**
- `idx_chapter_operation_jobs_chapter`
- `idx_chapter_operation_jobs_version`
- `idx_chapter_operation_jobs_status`
- `idx_chapter_operation_jobs_created`
- `idx_chapter_operation_jobs_metadata` (GIN)

---

### 11. **operation_references**

Materiais de referência usados em operações (links e arquivos).

```sql
CREATE TABLE IF NOT EXISTS operation_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES chapter_operation_jobs(id) ON DELETE CASCADE,
  reference_type TEXT NOT NULL CHECK (reference_type IN ('link', 'file')),
  reference_content TEXT NOT NULL,
  title TEXT,
  description TEXT,
  file_name TEXT,
  file_size BIGINT,
  mime_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Índices:**
- `idx_operation_references_job_id`

---

### 12. **improvement_jobs**

Jobs de análise de melhorias em documentos.

```sql
CREATE TABLE IF NOT EXISTS improvement_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'analyzing', 'completed', 'error')),
  global_context JSONB,
  document_structure JSONB,
  suggestions JSONB DEFAULT '[]'::jsonb,
  current_section INTEGER DEFAULT 0,
  total_sections INTEGER DEFAULT 0,
  progress_percentage INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE
);
```

**Índices:**
- `idx_improvement_jobs_document_id`
- `idx_improvement_jobs_status`

---

### 13. **norm_update_jobs**

Jobs de atualização de normas legais.

```sql
CREATE TABLE IF NOT EXISTS norm_update_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'analyzing', 'completed', 'error')),
  norm_references JSONB DEFAULT '[]'::jsonb,
  total_references INTEGER DEFAULT 0,
  vigentes INTEGER DEFAULT 0,
  alteradas INTEGER DEFAULT 0,
  revogadas INTEGER DEFAULT 0,
  substituidas INTEGER DEFAULT 0,
  manual_review INTEGER DEFAULT 0,
  current_reference INTEGER DEFAULT 0,
  progress_percentage INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);
```

**Índices:**
- `idx_norm_update_jobs_document_id`
- `idx_norm_update_jobs_status`
- `idx_norm_update_jobs_created_at`

---

### 14. **pipeline_jobs**

Jobs de pipeline com sequência de operações.

```sql
CREATE TABLE IF NOT EXISTS pipeline_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  selected_operations TEXT[] NOT NULL,
  operation_configs JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'paused', 'completed', 'failed', 'cancelled')),
  current_operation_index INTEGER DEFAULT 0,
  operation_results JSONB[] DEFAULT ARRAY[]::JSONB[],
  final_document_id UUID,
  final_document_path TEXT,
  error_message TEXT,
  total_cost_usd DECIMAL(10, 4) DEFAULT 0,
  total_duration_seconds INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);
```

**Índices:**
- `idx_pipeline_jobs_document`
- `idx_pipeline_jobs_status`
- `idx_pipeline_jobs_created_at`

---

### 15. **pipeline_intermediate_documents**

Documentos intermediários gerados durante pipeline.

```sql
CREATE TABLE IF NOT EXISTS pipeline_intermediate_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pipeline_job_id UUID NOT NULL REFERENCES pipeline_jobs(id) ON DELETE CASCADE,
  operation_name TEXT NOT NULL,
  operation_index INTEGER NOT NULL,
  storage_path TEXT NOT NULL,
  file_size_bytes BIGINT,
  operation_job_id UUID,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Índices:**
- `idx_pipeline_intermediate_docs`

---

## Funções e Stored Procedures

### 1. **update_updated_at_column()**

Atualiza automaticamente o campo `updated_at`.

```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

**Usado em:** `projects`, `documents`, `translation_jobs`, `settings`, `theses`, `chapters`

---

### 2. **get_next_chapter_order(p_thesis_id UUID)**

Retorna a próxima ordem de capítulo para uma tese.

```sql
CREATE OR REPLACE FUNCTION get_next_chapter_order(p_thesis_id UUID)
RETURNS INTEGER AS $$
BEGIN
  RETURN COALESCE(
    (SELECT MAX(chapter_order) + 1 FROM chapters WHERE thesis_id = p_thesis_id),
    1
  );
END;
$$ LANGUAGE plpgsql;
```

---

### 3. **get_next_version_number(p_chapter_id UUID)**

Retorna o próximo número de versão para um capítulo.

```sql
CREATE OR REPLACE FUNCTION get_next_version_number(p_chapter_id UUID)
RETURNS INTEGER AS $$
BEGIN
  RETURN COALESCE(
    (SELECT MAX(version_number) + 1 FROM chapter_versions WHERE chapter_id = p_chapter_id),
    1
  );
END;
$$ LANGUAGE plpgsql;
```

---

### 4. **create_chapter_version()**

Cria nova versão de capítulo com tratamento completo.

**Assinatura 1 (completa):**
```sql
CREATE OR REPLACE FUNCTION create_chapter_version(
  p_chapter_id UUID,
  p_file_path TEXT,
  p_pages INTEGER,
  p_chunks_count INTEGER,
  p_created_by_operation TEXT,
  p_parent_version_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID
```

**Assinatura 2 (simplificada - para operações):**
```sql
CREATE OR REPLACE FUNCTION public.create_chapter_version(
  p_chapter_id UUID,
  p_file_path TEXT,
  p_parent_version_id UUID DEFAULT NULL,
  p_created_by_operation TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
```

**Permissões:**
- `GRANT EXECUTE TO authenticated`
- `GRANT EXECUTE TO anon`

---

### 5. **get_next_thesis_version_number(p_thesis_id UUID)**

Retorna próximo número de versão para uma tese.

```sql
CREATE OR REPLACE FUNCTION get_next_thesis_version_number(p_thesis_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_next_version INTEGER;
BEGIN
  SELECT COALESCE(MAX(version_number), 0) + 1
  INTO v_next_version
  FROM thesis_versions
  WHERE thesis_id = p_thesis_id;

  RETURN v_next_version;
END;
$$;
```

---

### 6. **create_thesis_version()**

Cria nova versão compilada de tese.

```sql
CREATE OR REPLACE FUNCTION create_thesis_version(
  p_thesis_id UUID,
  p_file_path TEXT,
  p_total_pages INTEGER,
  p_chapters_included JSONB,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
```

---

## Políticas RLS (Row Level Security)

### 🔓 ESTADO ATUAL: PERMISSÕES ABERTAS PARA TESTES

**⚠️ ATENÇÃO CRÍTICA DE SEGURANÇA ⚠️**

Este projeto está em **fase de validação da versão 1 (V1)** e o banco de dados está configurado com **permissões totalmente abertas** para facilitar o desenvolvimento e testes.

### Tabelas com RLS Habilitado (mas sem restrições)

Todas as tabelas têm RLS habilitado mas **atualmente permitem todo acesso** (desenvolvimento):

```sql
ALTER TABLE [table_name] ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all access for now" ON [table_name] FOR ALL USING (true);
```

**Tabelas afetadas:**
- `projects`, `documents`, `translation_jobs`, `settings`
- `theses`, `chapters`, `chapter_versions`, `chapter_chunks`
- `chapter_operation_jobs`, `operation_references`
- `improvement_jobs`, `norm_update_jobs`
- `pipeline_jobs`, `pipeline_intermediate_documents`

### 🚨 RISCOS DE SEGURANÇA ATUAIS

**Com as permissões atuais, qualquer pessoa pode:**
1. ✅ Ler **TODOS** os dados de **TODOS** os usuários
2. ✅ Inserir dados em **QUALQUER** tabela
3. ✅ Modificar **QUALQUER** registro existente
4. ✅ Deletar **QUALQUER** dado do sistema
5. ✅ Acessar e modificar configurações globais (API keys, etc)

**Status:** ⚠️ **INSEGURO** - Adequado **APENAS** para desenvolvimento/testes

**Nunca use em produção neste estado!**

### ⚠️ Políticas de Produção - IMPLEMENTAÇÃO OBRIGATÓRIA

**IMPORTANTE:** As políticas atuais são **temporárias**. Em produção, implementar:

1. Sistema de autenticação Supabase Auth
2. Políticas baseadas em `auth.uid()`
3. Segregação de dados por usuário
4. Validação de todas as operações no backend
5. Criptografia de dados sensíveis (API keys)
6. Auditoria e logging de operações

**Exemplo para produção:**

```sql
-- 1. Remover política temporária
DROP POLICY "Enable all access for now" ON projects;

-- 2. Adicionar coluna de usuário (se não existir)
ALTER TABLE projects ADD COLUMN user_id UUID REFERENCES auth.users(id);

-- 3. Criar políticas de produção
CREATE POLICY "Users can view own projects"
  ON projects FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own projects"
  ON projects FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own projects"
  ON projects FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own projects"
  ON projects FOR DELETE
  USING (auth.uid() = user_id);
```

### 📋 Checklist de Segurança para Produção

Antes de ir para produção, **OBRIGATORIAMENTE**:

- [ ] Remover todas as políticas `USING (true)`
- [ ] Implementar autenticação de usuários (Supabase Auth)
- [ ] Adicionar coluna `user_id` em todas as tabelas principais
- [ ] Criar políticas RLS específicas por tabela
- [ ] Criptografar API keys no backend
- [ ] Implementar rate limiting
- [ ] Configurar CORS adequadamente
- [ ] Habilitar auditoria de operações
- [ ] Testar todas as políticas com diferentes níveis de acesso
- [ ] Implementar validação de entrada no backend
- [ ] Revisar permissões de Storage Buckets
- [ ] Configurar backups automáticos
- [ ] Implementar logging de erros e exceções
- [ ] Testar recuperação de desastres

---

## Storage Buckets

### 1. **documents**

Armazena documentos originais.

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;
```

**Políticas:**
```sql
CREATE POLICY "Enable all access for documents bucket"
ON storage.objects FOR ALL
USING (bucket_id = 'documents');
```

---

### 2. **translations**

Armazena documentos traduzidos.

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('translations', 'translations', false)
ON CONFLICT (id) DO NOTHING;
```

**Políticas:**
```sql
CREATE POLICY "Enable all access for translations bucket"
ON storage.objects FOR ALL
USING (bucket_id = 'translations');
```

---

### 3. **reference-materials**

Armazena materiais de referência para operações.

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('reference-materials', 'reference-materials', true)
ON CONFLICT (id) DO UPDATE SET public = true;
```

**Políticas:**
```sql
CREATE POLICY "Allow authenticated uploads"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'reference-materials');

CREATE POLICY "Allow public reads"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'reference-materials');

CREATE POLICY "Allow authenticated deletes"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'reference-materials');
```

---

### 4. **pipeline-outputs**

Armazena saídas intermediárias e finais de pipelines.

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('pipeline-outputs', 'pipeline-outputs', false)
ON CONFLICT (id) DO NOTHING;
```

**Políticas (por usuário):**
```sql
CREATE POLICY "Users can upload their pipeline outputs"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'pipeline-outputs'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Políticas similares para SELECT, UPDATE, DELETE
```

---

## Views

### 1. **thesis_summary**

Resumo de teses com contagem de capítulos.

```sql
CREATE OR REPLACE VIEW thesis_summary AS
SELECT
  t.id,
  t.title,
  t.description,
  t.created_at,
  t.updated_at,
  COUNT(c.id) as chapter_count,
  MIN(c.chapter_order) as first_chapter_order,
  MAX(c.chapter_order) as last_chapter_order
FROM theses t
LEFT JOIN chapters c ON c.thesis_id = t.id
GROUP BY t.id;
```

---

### 2. **chapter_details**

Detalhes de capítulos com versão atual.

```sql
CREATE OR REPLACE VIEW chapter_details AS
SELECT
  c.id as chapter_id,
  c.thesis_id,
  c.title as chapter_title,
  c.chapter_order,
  c.created_at as chapter_created_at,
  c.updated_at as chapter_updated_at,
  cv.id as current_version_id,
  cv.version_number,
  cv.file_path,
  cv.pages,
  cv.chunks_count,
  cv.created_by_operation,
  cv.metadata,
  cv.created_at as version_created_at,
  (SELECT COUNT(*) FROM chapter_versions WHERE chapter_id = c.id) as total_versions
FROM chapters c
LEFT JOIN chapter_versions cv ON cv.id = c.current_version_id;
```

---

## Triggers

### Auto-update de `updated_at`

```sql
CREATE TRIGGER update_[table]_updated_at
  BEFORE UPDATE ON [table]
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

**Aplicado em:**
- `projects`
- `documents`
- `translation_jobs`
- `settings`
- `theses`
- `chapters`

---

## Ordem de Execução das Migrations

Execute os arquivos SQL nesta ordem:

### 1. Schema Base
```sql
-- Execute: supabase-schema.sql
```
Cria: `projects`, `documents`, `translation_jobs`, `settings`, buckets básicos

### 2. Sistema de Teses
```sql
-- Execute: supabase/migrations/010_create_thesis_system_clean.sql
```
Cria: `theses`, `chapters`, `chapter_versions`, `chapter_chunks`, funções auxiliares

### 3. Versões de Teses
```sql
-- Execute: supabase/migrations/015_create_thesis_versions.sql
```
Cria: `thesis_versions`, funções de versionamento

### 4. Jobs de Operações
```sql
-- Execute: supabase/migrations/011_create_chapter_operation_jobs.sql
```
Cria: `chapter_operation_jobs`

### 5. Referências de Operações
```sql
-- Execute: supabase/migrations/012_create_operation_references.sql
```
Cria: `operation_references`

### 6. Função de Versão (Alternativa)
```sql
-- Execute: supabase/migrations/012_create_chapter_version_function.sql
```
Cria: Versão simplificada de `create_chapter_version()`

### 7. Metadata em Jobs
```sql
-- Execute: supabase/migrations/013_add_metadata_to_chapter_operation_jobs.sql
```
Adiciona: coluna `metadata` em `chapter_operation_jobs`

### 8. Bucket de Referências
```sql
-- Execute: supabase/migrations/014_create_reference_materials_bucket.sql
```
Cria: bucket `reference-materials` com políticas

### 9. Jobs de Melhoria
```sql
-- Execute: supabase/migrations/004_create_improvement_jobs.sql
```
Cria: `improvement_jobs`

### 10. Jobs de Atualização de Normas
```sql
-- Execute: supabase/migrations/create_norm_update_jobs.sql
```
Cria: `norm_update_jobs`

### 11. Pipeline
```sql
-- Execute: supabase/migrations/create_pipeline_tables.sql
-- Execute: supabase/migrations/create_pipeline_storage.sql
```
Cria: `pipeline_jobs`, `pipeline_intermediate_documents`, bucket de pipeline

### 12. Correções de RLS (se necessário)
```sql
-- Execute: supabase/migrations/fix_pipeline_rls.sql
```
Ajusta políticas RLS para pipelines

---

## Verificação Pós-Instalação

### 1. Verificar Tabelas

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

**Esperado (15 tabelas):**
- `chapters`
- `chapter_chunks`
- `chapter_operation_jobs`
- `chapter_versions`
- `documents`
- `improvement_jobs`
- `norm_update_jobs`
- `operation_references`
- `pipeline_intermediate_documents`
- `pipeline_jobs`
- `projects`
- `settings`
- `theses`
- `thesis_versions`
- `translation_jobs`

---

### 2. Verificar Funções

```sql
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
ORDER BY routine_name;
```

**Esperado:**
- `create_chapter_version` (function)
- `create_thesis_version` (function)
- `get_next_chapter_order` (function)
- `get_next_thesis_version_number` (function)
- `get_next_version_number` (function)
- `update_updated_at_column` (function)

---

### 3. Verificar Buckets

```sql
SELECT id, name, public, created_at
FROM storage.buckets
ORDER BY name;
```

**Esperado:**
- `documents` (public: false)
- `pipeline-outputs` (public: false)
- `reference-materials` (public: true)
- `translations` (public: false)

---

### 4. Verificar RLS

```sql
SELECT schemaname, tablename, policyname
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

Deve retornar políticas para todas as tabelas.

---

### 5. Verificar Views

```sql
SELECT table_name
FROM information_schema.views
WHERE table_schema = 'public';
```

**Esperado:**
- `chapter_details`
- `thesis_summary`

---

### 6. Teste Básico de Inserção

```sql
-- Teste 1: Inserir settings
INSERT INTO settings (id, models, prices_usd)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  '{"openai": ["gpt-4o-mini"]}',
  '{"gpt-4o-mini": {"in": 0.00015, "out": 0.0006}}'
)
ON CONFLICT DO NOTHING;

-- Teste 2: Criar projeto
INSERT INTO projects (name, description)
VALUES ('Teste Migration', 'Projeto de teste')
RETURNING id, name, created_at;

-- Teste 3: Criar tese
INSERT INTO theses (title, description)
VALUES ('Tese de Teste', 'Descrição da tese')
RETURNING id, title, created_at;
```

---

### 7. Verificar Constraints

```sql
SELECT
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type
FROM information_schema.table_constraints tc
WHERE tc.table_schema = 'public'
  AND tc.constraint_type IN ('FOREIGN KEY', 'UNIQUE', 'CHECK')
ORDER BY tc.table_name, tc.constraint_type;
```

---

## Variáveis de Ambiente

Configure no arquivo `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-chave-anon
```

---

## Notas de Produção

### Segurança

1. **Remover políticas temporárias**: As políticas `USING (true)` devem ser substituídas por políticas baseadas em autenticação.

2. **Implementar autenticação**: Configurar Supabase Auth e adicionar coluna `user_id` nas tabelas principais.

3. **Revisar permissões de funções**: Funções com `SECURITY DEFINER` devem ser auditadas.

4. **Bucket público**: O bucket `reference-materials` é público. Avaliar se isso é adequado para produção.

### Performance

1. **Monitorar índices**: Adicionar índices conforme padrões de consulta reais.

2. **Particionamento**: Considerar particionamento para tabelas grandes (`chapter_chunks`, `operation_references`).

3. **Vacuum e Analyze**: Configurar manutenção automática do PostgreSQL.

### Backup

1. Configurar backups automáticos no Supabase Dashboard
2. Exportar schema regularmente: `pg_dump -s`
3. Testar restauração periodicamente

---

## Suporte

Para dúvidas ou problemas:
1. Consulte a [documentação do Supabase](https://supabase.com/docs)
2. Verifique os logs no Supabase Dashboard > Database > Logs
3. Execute queries de verificação acima

---

**Última atualização:** 2024-01-24
**Versão do Schema:** 1.0
**PostgreSQL:** 15.x (Supabase)
