import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { checkBookAssemblySchema } from '@/lib/book-assembly/schema';

export async function GET() {
  try {
    await checkBookAssemblySchema(supabase);
    return NextResponse.json({ ready: true });
  } catch (error: any) {
    return NextResponse.json(
      { ready: false, error: error.message || 'Falha ao verificar a estrutura de Montar Livro.' },
      { status: 503 }
    );
  }
}
