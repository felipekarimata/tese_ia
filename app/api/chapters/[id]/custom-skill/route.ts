import { NextRequest, NextResponse } from 'next/server';
import { state } from '@/lib/state';
import { DEFAULT_SKILLS_SETTINGS } from '@/lib/skills/types';
import {
  findCustomSkillInSettings,
  resolveCustomSkillAction,
} from '@/lib/agent/skill-dispatch';
import {
  startChapterCustomSkillJob,
  executeChapterCustomSkill,
} from '@/lib/custom-skill/execute';
import { AIProvider } from '@/lib/ai/types';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: chapterId } = await params;
    const body = await req.json();
    const {
      versionId,
      skillName,
      args,
      provider = 'openai',
      model = 'gpt-5.6-terra',
    }: {
      versionId: string;
      skillName: string;
      args?: string;
      provider?: AIProvider;
      model?: string;
    } = body;

    if (!versionId || !skillName?.trim()) {
      return NextResponse.json(
        { error: 'versionId e skillName são obrigatórios' },
        { status: 400 }
      );
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

    const jobId = await startChapterCustomSkillJob(chapterId, versionId, action);

    executeChapterCustomSkill(jobId, chapterId, versionId, action, provider, model).catch(
      (err) => console.error('[CHAPTER-CUSTOM-SKILL] Background error:', err)
    );

    return NextResponse.json({
      jobId,
      message: 'Skill personalizada iniciada (documento inteiro)',
      chapterId,
      versionId,
      skill: cmd,
    });
  } catch (error: any) {
    console.error('[CHAPTER-CUSTOM-SKILL] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
