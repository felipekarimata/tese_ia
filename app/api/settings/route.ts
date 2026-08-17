import { NextRequest, NextResponse } from 'next/server';
import { state, toPublicSettings } from '@/lib/state';
import type { SkillsSettings } from '@/lib/skills/types';
import { DEFAULT_SKILLS_SETTINGS } from '@/lib/skills/types';
import { normalizeMulti3Settings } from '@/lib/multi-ai/models';
import {
  loadCommandPromptOverrides,
  saveCommandPromptOverrides,
} from '@/lib/book-workflow/prompt-settings';

export const runtime = 'nodejs';

function mergeSkills(incoming?: SkillsSettings): void {
  if (!incoming) return;
  const current = state.settings.skills ?? { ...DEFAULT_SKILLS_SETTINGS };
  state.settings.skills = {
    promptOverrides: incoming.promptOverrides ?? current.promptOverrides ?? {},
    customSkills: incoming.customSkills ?? current.customSkills ?? [],
  };
}

export async function GET() {
  try {
    state.settings.commandPrompts = await loadCommandPromptOverrides({
      force: true,
      tolerateMissingMigration: true,
      fallbackToDefaults: true,
    });
    return NextResponse.json({
      settings: toPublicSettings(state.settings),
    });
  } catch (error: any) {
    console.error('Settings get error:', error);
    return NextResponse.json(
      { error: `Failed to get settings: ${error.message}` },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      openaiKey,
      googleKey,
      xaiKey,
      anthropicKey,
      models,
      multi3,
      documentProcessing,
      skills,
      commandPrompts,
    } = body;

    if (typeof openaiKey === 'string' && openaiKey.trim()) {
      state.settings.openaiKey = openaiKey.trim();
    }
    if (typeof googleKey === 'string' && googleKey.trim()) {
      state.settings.googleKey = googleKey.trim();
    }
    if (typeof xaiKey === 'string' && xaiKey.trim()) {
      state.settings.xaiKey = xaiKey.trim();
    }
    if (typeof anthropicKey === 'string' && anthropicKey.trim()) {
      state.settings.anthropicKey = anthropicKey.trim();
    }
    if (models !== undefined) state.settings.models = models;
    state.settings.multi3 = normalizeMulti3Settings(
      multi3 ?? state.settings.multi3,
      state.settings.models
    );
    if (documentProcessing !== undefined) {
      state.settings.documentProcessing = {
        ...state.settings.documentProcessing,
        ...documentProcessing,
      };
    }
    mergeSkills(skills);
    if (commandPrompts !== undefined) {
      state.settings.commandPrompts = await saveCommandPromptOverrides(commandPrompts);
    } else {
      state.settings.commandPrompts = await loadCommandPromptOverrides({
        force: true,
        tolerateMissingMigration: true,
        fallbackToDefaults: true,
      });
    }

    return NextResponse.json({
      success: true,
      settings: toPublicSettings(state.settings),
    });
  } catch (error: any) {
    console.error('Settings update error:', error);
    return NextResponse.json(
      { error: `Failed to update settings: ${error.message}` },
      { status: 500 }
    );
  }
}
