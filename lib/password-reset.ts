import crypto from 'crypto';
import { supabaseAdmin } from './supabase-admin';

/**
 * Tokens de redefinição de senha.
 * O token cru (UUID) vai no email; no banco guardamos só o sha256 hex.
 * Expira em 1 hora e é de uso único.
 */

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hora

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Cria um token de reset para o usuário e retorna o token CRU (para montar o link).
 */
export async function createPasswordResetToken(userId: string): Promise<string> {
  const token = crypto.randomUUID();
  const token_hash = hashToken(token);
  const expires_at = new Date(Date.now() + TOKEN_TTL_MS).toISOString();

  const { error } = await supabaseAdmin
    .from('password_reset_tokens')
    .insert({ user_id: userId, token_hash, expires_at });

  if (error) {
    throw new Error(error.message);
  }
  return token;
}

/**
 * Valida um token cru. Retorna o registro (id + user_id) se válido, senão null.
 */
export async function validateResetToken(
  token: string
): Promise<{ id: string; user_id: string } | null> {
  if (!token) return null;
  const token_hash = hashToken(token);

  const { data, error } = await supabaseAdmin
    .from('password_reset_tokens')
    .select('id, user_id, expires_at, used_at')
    .eq('token_hash', token_hash)
    .is('used_at', null)
    .maybeSingle();

  if (error || !data) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;

  return { id: data.id, user_id: data.user_id };
}

/**
 * Marca o token como usado (uso único).
 */
export async function markTokenUsed(tokenId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('password_reset_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('id', tokenId);

  if (error) {
    throw new Error(error.message);
  }
}
