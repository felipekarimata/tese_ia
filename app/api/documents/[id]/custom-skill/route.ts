import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { state } from '@/lib/state';
import { DEFAULT_SKILLS_SETTINGS } from '@/lib/skills/types';
import {
  findCustomSkillInSettings,
  resolveCustomSkillAction,
} from '@/lib/agent/skill-dispatch';
import { executeDocumentCustomSkill } from '@/lib/custom-skill/execute';
import { AIProvider } from '@/lib/ai/types';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: documentId } = await params;
    const body = await req.json();
    const {
      skillName,
      args,
      provider = 'openai',
      model = 'gpt-5.6',
    }: {
      skillName: string;
      args?: string;
      provider?: AIProvider;
      model?: string;
    } = body;

    if (!skillName?.trim()) {
      return NextResponse.json({ error: 'skillName é obrigatório' }, { status: 400 });
    }

    const { data: doc, error: docError } = await supabase
      .from('documents')
      .select('id, title, file_path, project_id')
      .eq('id', documentId)
      .single();

    if (docError || !doc) {
      return NextResponse.json({ error: 'Documento não encontrado' }, { status: 404 });
    }

    const cmd = skillName.startsWith('/') ? skillName : `/${skillName}`;
    const skills = state.settings.skills ?? DEFAULT_SKILLS_SETTINGS;
    const skill = findCustomSkillInSettings(cmd, skills.customSkills);
    if (!skill) {
      return NextResponse.json({ error: `Skill não encontrada: ${cmd}` }, { status: 404 });
    }

    const action = resolveCustomSkillAction(skill, args);
    if ('error' in action) {
      return NextResponse.json({ error: action.error }, { status: 400 });
    }

    const { data: job, error: jobError } = await supabase
      .from('adjust_jobs')
      .insert({
        document_id: documentId,
        status: 'pending',
        instructions: action.prompt.slice(0, 4000),
        creativity: 5,
        use_grounding: false,
        provider,
        model,
      })
      .select()
      .single();

    if (jobError || !job) {
      throw new Error('Falha ao criar job');
    }

    executeDocumentCustomSkill(
      documentId,
      { title: doc.title, file_path: doc.file_path, project_id: doc.project_id },
      job.id,
      action,
      provider,
      model
    ).catch((err) => {
      console.error('[DOCUMENT-CUSTOM-SKILL] Background error:', err);
    });

    return NextResponse.json({
      jobId: job.id,
      message: 'Skill personalizada iniciada (documento inteiro)',
      documentId,
      skill: cmd,
    });
  } catch (error: any) {
    console.error('[DOCUMENT-CUSTOM-SKILL] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
