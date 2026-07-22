import { createClient } from '@supabase/supabase-js';
import { Database } from './supabase-types';

/**
 * Durante `next build`, o Next importa rotas API; no Docker as envs podem não existir
 * nessa fase. Evitar throw na importação — placeholders só para o bundle; sem env real
 * as chamadas ao Supabase falham em runtime com erro da API.
 */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const urlForClient =
  supabaseUrl?.trim() || 'https://placeholder.supabase.co';
const keyForClient =
  supabaseAnonKey?.trim() ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.build-placeholder';

if (!supabaseUrl?.trim() || !supabaseAnonKey?.trim()) {
  if (process.env.NODE_ENV === 'development') {
    console.warn(
      '[supabase] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY ausentes; configure .env.local (build prossegue com cliente placeholder).'
    );
  } else {
    console.warn(
      '[supabase] NEXT_PUBLIC_SUPABASE_* ausentes; defina-as no runtime (e no build Docker com ARG/ENV antes de npm run build se precisar inline em client).'
    );
  }
}

export const supabase = createClient<Database>(urlForClient, keyForClient);
