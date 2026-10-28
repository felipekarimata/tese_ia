import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getUserById, setUserActive, setUserRole } from '@/lib/auth-db';
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
  if (!session?.user || session.user.role !== 'admin') return null;
  return session;
}

// PATCH /api/admin/users/:id — { action: 'toggle-active' | 'toggle-role' }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
  }

  const { id } = await params;
  const target = await getUserById(id);
  if (!target) {
    return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 });
  }

  try {
    const { action } = await req.json();

    if (action === 'toggle-active') {
      // Não permite desativar a própria conta.
      if (id === session.user.id && target.is_active) {
        return NextResponse.json(
          { error: 'Você não pode desativar a própria conta.' },
          { status: 400 }
        );
      }
      await setUserActive(id, !target.is_active);
      return NextResponse.json({ ok: true, is_active: !target.is_active });
    }

    if (action === 'toggle-role') {
      const newRole = target.role === 'admin' ? 'user' : 'admin';
      // Não permite remover o próprio papel de admin.
      if (id === session.user.id && newRole === 'user') {
        return NextResponse.json(
          { error: 'Você não pode remover o seu próprio papel de administrador.' },
          { status: 400 }
        );
      }
      await setUserRole(id, newRole);
      return NextResponse.json({ ok: true, role: newRole });
    }

    return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
  } catch (e: any) {
    console.error('[admin/users/:id] erro PATCH:', e);
    return NextResponse.json({ error: e.message || 'Erro ao atualizar usuário.' }, { status: 500 });
  }
}

// POST /api/admin/users/:id — dispara reset de senha para o usuário
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
  }

  const { id } = await params;
  const target = await getUserById(id);
  if (!target) {
    return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 });
  }

  try {
    const token = await createPasswordResetToken(target.id);
    const resetUrl = `${baseUrl(req)}/resetar-senha?token=${token}`;
    await sendPasswordResetEmail(target.email, resetUrl, { isNewUser: !target.password_hash });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('[admin/users/:id] erro ao resetar senha:', e);
    return NextResponse.json({ error: 'Erro ao enviar email de redefinição.' }, { status: 500 });
  }
}
