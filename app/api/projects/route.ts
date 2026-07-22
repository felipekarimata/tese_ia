import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET /api/projects - Lista todos os projetos
export async function GET() {
  try {
    // Busca todos os projetos
    const { data: projects, error } = await supabase
      .from('projects')
      .select('id, name, description, created_at, updated_at')
      .order('updated_at', { ascending: false });

    if (error) throw error;

    // Para cada projeto, conta quantos documentos ele tem
    const projectsWithCounts = await Promise.all(
      (projects || []).map(async (project) => {
        const { count } = await supabase
          .from('documents')
          .select('*', { count: 'exact', head: true })
          .eq('project_id', project.id);

        return {
          id: project.id,
          name: project.name,
          description: project.description,
          createdAt: project.created_at,
          updatedAt: project.updated_at,
          documentCount: count || 0
        };
      })
    );

    return NextResponse.json({ projects: projectsWithCounts });
  } catch (error: any) {
    console.error('Error listing projects:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

// POST /api/projects - Cria novo projeto
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, description } = body;

    if (!name || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Project name is required' },
        { status: 400 }
      );
    }

    const { data: project, error } = await supabase
      .from('projects')
      .insert({
        name: name.trim(),
        description: description?.trim() || null
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
        createdAt: project.created_at,
        updatedAt: project.updated_at,
        documentCount: 0
      }
    });
  } catch (error: any) {
    console.error('Error creating project:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
