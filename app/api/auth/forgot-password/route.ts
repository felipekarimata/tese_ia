import { NextRequest, NextResponse } from 'next/server';
import { getUserByEmail } from '@/lib/auth-db';
import { createPasswordResetToken } from '@/lib/password-reset';
import { sendPasswordResetEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

function baseUrl(req: NextRequest): string {
  return (
    process.env.NEXTAUTH_URL?.trim() ||
    process.env.AUTH_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    req.nextUrl.origin
  );
}

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json().catch(() => ({ email: '' }));

    if (email && typeof email === 'string') {
      const user = await getUserByEmail(email);
      // Só gera token se o usuário existe e está ativo — mas a resposta é
      // sempre genérica (não revela se o email está cadastrado).
      if (user && user.is_active) {
        try {
          const token = await createPasswordResetToken(user.id);
          const resetUrl = `${baseUrl(req)}/resetar-senha?token=${token}`;
          await sendPasswordResetEmail(user.email, resetUrl, {
            isNewUser: !user.password_hash,
          });
        } catch (e) {
          console.error('[forgot-password] erro ao gerar/enviar token:', e);
        }
      }
    }

    return NextResponse.json({
      message: 'Se o email existir, você receberá um link para redefinir a senha.',
    });
  } catch (e) {
    // Mesmo em erro inesperado, resposta genérica.
    console.error('[forgot-password] erro:', e);
    return NextResponse.json({
      message: 'Se o email existir, você receberá um link para redefinir a senha.',
    });
  }
}
