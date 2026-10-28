import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Keep-alive do Supabase: projetos no plano free hibernam após ~7 dias sem
 * atividade. Este endpoint faz uma leitura mínima para manter o banco ativo.
 * Agende uma chamada (ex.: a cada 24h) via cron do Coolify ou serviço externo.
 *
 * Proteção opcional: se CRON_SECRET estiver definido, exige
 * `Authorization: Bearer <secret>` ou `?secret=<secret>`.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    const auth = req.headers.get('authorization') || '';
    const qp = req.nextUrl.searchParams.get('secret') || '';
    const provided = auth.startsWith('Bearer ') ? auth.slice(7) : qp;
    if (provided !== secret) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }
  }

  try {
    // Leitura mínima (equivalente a um "SELECT 1") para manter o banco ativo.
    const { error } = await supabaseAdmin
      .from('settings')
      .select('id', { head: true, count: 'exact' });

    if (error) {
      return NextResponse.json(
        { status: 'error', message: error.message, timestamp: new Date().toISOString() },
        { status: 500 }
      );
    }

    return NextResponse.json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch (e: any) {
    return NextResponse.json(
      { status: 'error', message: e?.message || 'Falha no keep-alive', timestamp: new Date().toISOString() },
      { status: 500 }
    );
  }
}
