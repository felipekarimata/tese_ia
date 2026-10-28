-- ============================================================================
-- MIGRATION: Tabela de usuários (auth real com bcrypt)
-- Descrição: Substitui o Map em memória / admin hardcoded do auth.ts por uma
--            tabela persistente. Senhas ficam como hash bcrypt (nunca em texto
--            puro). Usuários sem senha (password_hash NULL) precisam definir a
--            senha via fluxo "esqueci minha senha" antes do primeiro acesso.
-- Data: 2026-10-28
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- TABELA: users
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL,
  name          TEXT,
  password_hash TEXT,                                 -- NULL até o usuário definir senha (ou login só via Microsoft)
  role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  is_active     BOOLEAN NOT NULL DEFAULT true,
  auth_provider TEXT NOT NULL DEFAULT 'credentials' CHECK (auth_provider IN ('credentials', 'microsoft')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);

-- Email único e sempre tratado em lowercase (unicidade case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON public.users (lower(email));

-- ============================================================================
-- TRIGGER: updated_at automático
-- ============================================================================
CREATE OR REPLACE FUNCTION public.set_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated_at ON public.users;
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.set_users_updated_at();

-- ============================================================================
-- ROW LEVEL SECURITY
-- Observação: o acesso é feito exclusivamente pelo backend (Next.js) com a
-- service role key. Mantemos uma policy permissiva por ora, como no restante do
-- schema. TODO: endurecer RLS depois (restringir a service_role / colunas).
-- ============================================================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_all_access_for_now" ON public.users;
CREATE POLICY "users_all_access_for_now" ON public.users
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- SEEDS: administradores iniciais (sem senha — ativam via "esqueci minha senha")
-- ============================================================================
INSERT INTO public.users (email, name, role, password_hash, auth_provider)
VALUES
  ('admin@tese.com',          'Administrador',    'admin', NULL, 'credentials'),
  ('marcelino@rmsa.com.br',   'Jorge Marcelino',  'admin', NULL, 'credentials'),
  ('felipe@eyesbot.com.br',   'Felipe Karimata',  'admin', NULL, 'credentials')
ON CONFLICT (lower(email)) DO NOTHING;
