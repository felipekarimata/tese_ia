-- ============================================================================
-- MIGRATION: Tokens de redefinição de senha
-- Descrição: Suporta o fluxo "esqueci minha senha" e "definir senha" (usuário
--            novo criado pelo admin). O token é enviado por email em texto puro,
--            mas no banco guardamos APENAS o sha256 hex dele. Expira em 1 hora e
--            é de uso único (used_at).
-- Data: 2026-10-28
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,                       -- sha256 hex do token enviado
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,                         -- NULL = ainda não usado
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Busca por token ainda válido
CREATE INDEX IF NOT EXISTS idx_prt_token_hash_used
  ON public.password_reset_tokens (token_hash, used_at);

CREATE INDEX IF NOT EXISTS idx_prt_user_id
  ON public.password_reset_tokens (user_id);

-- ============================================================================
-- ROW LEVEL SECURITY (acesso só pelo backend; policy permissiva por ora)
-- ============================================================================
ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "prt_all_access_for_now" ON public.password_reset_tokens;
CREATE POLICY "prt_all_access_for_now" ON public.password_reset_tokens
  FOR ALL USING (true) WITH CHECK (true);
