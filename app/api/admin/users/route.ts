import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { listUsers, getUserByEmail, createUser } from '@/lib/auth-db';
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

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') {
    return null;
  }
  return session;
}

// GET /api/admin/users — lista todos os usuários
export async function GET() {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
  }
  const users = await listUsers();
  return NextResponse.json({ users });
}

// POST /api/admin/users — cria usuário (sem senha) e dispara email de "defina sua senha"
export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
  }

  try {
    const { email, name, role } = await req.json();

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json({ error: 'Email inválido.' }, { status: 400 });
    }
    if (role && role !== 'admin' && role !== 'user') {
      return NextResponse.json({ error: 'Papel inválido.' }, { status: 400 });
    }

    const existing = await getUserByEmail(email);
    if (existing) {
      return NextResponse.json({ error: 'Já existe um usuário com este email.' }, { status: 409 });
    }

    const user = await createUser({
      email,
      name: name?.trim() || null,
      password: null,
      role: role === 'admin' ? 'admin' : 'user',
    });

    // Dispara email para o usuário definir a senha (mesmo fluxo técnico do reset).
    try {
      const token = await createPasswordResetToken(user.id);
      const resetUrl = `${baseUrl(req)}/resetar-senha?token=${token}`;
      await sendPasswordResetEmail(user.email, resetUrl, { isNewUser: true });
    } catch (e) {
      console.error('[admin/users] erro ao enviar email de definição de senha:', e);
    }

    return NextResponse.json({ user });
  } catch (e: any) {
    console.error('[admin/users] erro ao criar usuário:', e);
    return NextResponse.json({ error: e.message || 'Erro ao criar usuário.' }, { status: 500 });
  }
}
