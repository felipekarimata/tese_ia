import { state } from '@/lib/state';
import { getDefaultPromptBuilder, resolveSkillKeyForContext } from './defaults';
import type {
  CustomSkill,
  SkillContext,
  SkillKey,
  SkillPromptVars,
  SkillsSettings,
} from './types';
import { DEFAULT_SKILLS_SETTINGS } from './types';

function getSkillsSettings(): SkillsSettings {
  return state.settings.skills ?? DEFAULT_SKILLS_SETTINGS;
}

export function applyPlaceholders(template: string, vars: SkillPromptVars): string {
  return template
    .replace(/\{\{args\}\}/g, vars.args ?? '')
    .replace(/\{\{style\}\}/g, vars.style ?? '')
    .replace(/\{\{section\}\}/g, vars.section ?? '')
    .replace(/\{\{paragraphs\}\}/g, vars.paragraphs ?? '')
    .replace(/\{\{document\}\}/g, vars.document ?? '')
    .replace(/\{\{creativity\}\}/g, String(vars.creativity ?? 5))
    .replace(/\{\{audience\}\}/g, vars.audience ?? '')
    .replace(/\{\{language\}\}/g, vars.language ?? '');
}

export function resolveSkillPrompt(
  key: SkillKey,
  vars: SkillPromptVars,
  context: SkillContext = 'direct',
  settings?: SkillsSettings
): string {
  const skills = settings ?? getSkillsSettings();
  const resolvedKey = resolveSkillKeyForContext(key, context);
  const override = skills.promptOverrides[resolvedKey] ?? skills.promptOverrides[key];
  const builder = getDefaultPromptBuilder(resolvedKey);

  if (override && override.trim()) {
    return applyPlaceholders(override, vars);
  }

  return builder(vars);
}

export function composeCustomSkillInstructions(
  skill: CustomSkill,
  userArgs?: string,
  extra?: Partial<SkillPromptVars>
): string {
  const vars: SkillPromptVars = {
    args: userArgs ?? '',
    style: extra?.style,
    audience: extra?.audience,
    language: extra?.language,
    ...extra,
  };
  const base = applyPlaceholders(skill.prompt, vars);
  if (userArgs && !skill.prompt.includes('{{args}}')) {
    return `${base.trim()}\n\n${userArgs}`.trim();
  }
  return base.trim();
}

export function findCustomSkill(name: string, settings?: SkillsSettings): CustomSkill | undefined {
  const skills = settings ?? getSkillsSettings();
  return skills.customSkills.find((s) => s.name.toLowerCase() === name.toLowerCase());
}

export function validateCustomSkillName(name: string, existing: CustomSkill[], excludeId?: string): string | null {
  if (!name.startsWith('/')) return 'O nome deve começar com /';
  if (!/^\/[a-z0-9-]+$/.test(name)) return 'Use apenas letras minúsculas, números e hífens';
  if (name.length < 2) return 'Nome muito curto';
  const lower = name.toLowerCase();
  if (['3', 'limpar', 'todos', 'comparar'].some((r) => lower === `/${r}`)) {
    return 'Nome reservado pelo sistema';
  }
  if (existing.some((s) => s.id !== excludeId && s.name.toLowerCase() === lower)) {
    return 'Já existe uma skill com este nome';
  }
  return null;
}
