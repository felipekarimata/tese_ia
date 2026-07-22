import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET /api/projects/[id] - Retorna projeto com seus documentos
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Busca o projeto
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .single();

    if (projectError || !project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    // Busca todos os documentos do projeto
    const { data: documents, error: docsError } = await supabase
      .from('documents')
      .select('id, title, pages, chunks_count')
      .eq('project_id', id);

    if (docsError) throw docsError;

    return NextResponse.json({
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
        createdAt: project.created_at,
        updatedAt: project.updated_at,
        documentCount: documents?.length || 0
      },
      documents: (documents || []).map(doc => ({
        id: doc.id,
        title: doc.title,
        pages: doc.pages,
        chunksCount: doc.chunks_count
      }))
    });
  } catch (error: any) {
    console.error('Error getting project:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

// DELETE /api/projects/[id] - Deleta projeto (SET NULL nos documentos)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Verifica se o projeto existe
    const { data: project } = await supabase
      .from('projects')
      .select('id')
      .eq('id', id)
      .single();

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    // Remove projectId de todos os documentos do projeto (SET NULL)
    await supabase
      .from('documents')
      .update({ project_id: null })
      .eq('project_id', id);

    // Deleta o projeto
    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({
      message: 'Project deleted successfully',
      projectId: id
    });
  } catch (error: any) {
    console.error('Error deleting project:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

// PATCH /api/projects/[id] - Atualiza projeto
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { name, description } = body;

    // Prepara campos para atualizar
    const updates: any = {};
    if (name !== undefined && name.trim().length > 0) {
      updates.name = name.trim();
    }
    if (description !== undefined) {
      updates.description = description.trim() || null;
    }

    // Atualiza o projeto
    const { data: project, error } = await supabase
      .from('projects')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error || !project) {
      return NextResponse.json(
        { error: error?.message || 'Project not found' },
        { status: error ? 500 : 404 }
      );
    }

    // Conta documentos do projeto
    const { count } = await supabase
      .from('documents')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', id);

    return NextResponse.json({
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
        createdAt: project.created_at,
        updatedAt: project.updated_at,
        documentCount: count || 0
      }
    });
  } catch (error: any) {
    console.error('Error updating project:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
