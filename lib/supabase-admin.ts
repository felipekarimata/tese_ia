import { createClient } from '@supabase/supabase-js';

/**
 * Cliente Supabase com SERVICE ROLE para uso EXCLUSIVO no servidor.
 *
 * - NUNCA importe este arquivo em componentes de cliente ("use client").
 * - Usa SUPABASE_SERVICE_ROLE_KEY (ignora RLS). Se não estiver definida,
 *   cai para a anon key — funciona hoje porque as policies são permissivas
 *   (USING true), mas o correto em produção é definir a service role key.
 * - Durante `next build` as envs podem não existir; usamos placeholders para
 *   não quebrar o bundle (as chamadas reais falham em runtime sem env válida).
 */
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || 'https://placeholder.supabase.co';

const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.build-placeholder';

if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() && process.env.NODE_ENV !== 'production') {
  console.warn(
    '[supabase-admin] SUPABASE_SERVICE_ROLE_KEY ausente; usando anon key como fallback. Defina a service role key para o acesso de servidor correto.'
  );
}

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
