import { NextRequest, NextResponse } from 'next/server';
import { validateResetToken, markTokenUsed } from '@/lib/password-reset';
import { updatePassword, hashPassword } from '@/lib/auth-db';

export const dynamic = 'force-dynamic';

// GET /api/auth/reset-password?token=xxx — valida o token
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token') || '';
  const record = await validateResetToken(token);
  return NextResponse.json({ valid: Boolean(record) });
}

// POST /api/auth/reset-password { token, password } — redefine a senha
export async function POST(req: NextRequest) {
  try {
    const { token, password } = await req.json();

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Token inválido.' }, { status: 400 });
    }
    if (!password || typeof password !== 'string' || password.length < 8) {
      return NextResponse.json(
        { error: 'A senha precisa ter no mínimo 8 caracteres.' },
        { status: 400 }
      );
    }

    const record = await validateResetToken(token);
    if (!record) {
      return NextResponse.json(
        { error: 'Link inválido ou expirado. Solicite um novo.' },
        { status: 400 }
      );
    }

    const passwordHash = await hashPassword(password);
    await updatePassword(record.user_id, passwordHash);
    await markTokenUsed(record.id);

    return NextResponse.json({ message: 'Senha redefinida com sucesso.' });
  } catch (e: any) {
    console.error('[reset-password] erro:', e);
    return NextResponse.json(
      { error: 'Não foi possível redefinir a senha. Tente novamente.' },
      { status: 500 }
    );
  }
}
