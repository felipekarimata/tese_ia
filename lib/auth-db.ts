import bcrypt from 'bcryptjs';
import { supabaseAdmin } from './supabase-admin';

/**
 * Camada de acesso a usuários no Supabase (service role, somente servidor).
 * Toda normalização de email para lowercase acontece aqui.
 */

export type DbUser = {
  id: string;
  email: string;
  name: string | null;
  password_hash: string | null;
  role: 'admin' | 'user';
  is_active: boolean;
  auth_provider: 'credentials' | 'microsoft';
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
};

const BCRYPT_ROUNDS = 10;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function getUserByEmail(email: string): Promise<DbUser | null> {
  const normalized = normalizeEmail(email);
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('email', normalized)
    .maybeSingle();

  if (error) {
    console.error('[auth-db] getUserByEmail erro:', error.message);
    return null;
  }
  return (data as DbUser) ?? null;
}

export async function getUserById(id: string): Promise<DbUser | null> {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('[auth-db] getUserById erro:', error.message);
    return null;
  }
  return (data as DbUser) ?? null;
}

export async function listUsers(): Promise<DbUser[]> {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[auth-db] listUsers erro:', error.message);
    return [];
  }
  return (data as DbUser[]) ?? [];
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function createUser(params: {
  email: string;
  name?: string | null;
  password?: string | null;
  role?: 'admin' | 'user';
}): Promise<DbUser> {
  const email = normalizeEmail(params.email);
  const password_hash = params.password ? await hashPassword(params.password) : null;

  const { data, error } = await supabaseAdmin
    .from('users')
    .insert({
      email,
      name: params.name ?? null,
      password_hash,
      role: params.role ?? 'user',
      is_active: true,
      auth_provider: 'credentials',
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message);
  }
  return data as DbUser;
}

export async function updatePassword(userId: string, newPasswordHash: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('users')
    .update({ password_hash: newPasswordHash })
    .eq('id', userId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function setLastLogin(userId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('users')
    .update({ last_login_at: new Date().toISOString() })
    .eq('id', userId);

  if (error) {
    console.error('[auth-db] setLastLogin erro:', error.message);
  }
}

export async function setUserActive(userId: string, isActive: boolean): Promise<void> {
  const { error } = await supabaseAdmin
    .from('users')
    .update({ is_active: isActive })
    .eq('id', userId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function setUserRole(userId: string, role: 'admin' | 'user'): Promise<void> {
  const { error } = await supabaseAdmin
    .from('users')
    .update({ role })
    .eq('id', userId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function setAuthProvider(
  userId: string,
  provider: 'credentials' | 'microsoft'
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('users')
    .update({ auth_provider: provider })
    .eq('id', userId);

  if (error) {
    console.error('[auth-db] setAuthProvider erro:', error.message);
  }
}
