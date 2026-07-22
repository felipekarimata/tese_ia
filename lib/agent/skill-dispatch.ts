import type { CustomSkill, SkillOperation } from '@/lib/skills/types';
import { composeCustomSkillInstructions } from '@/lib/skills/resolver';
import { SupportedLanguage } from '@/lib/translation/types';

const LANGUAGE_MAP: Record<string, SupportedLanguage> = {
  português: 'pt',
  portugues: 'pt',
  pt: 'pt',
  inglês: 'en',
  ingles: 'en',
  english: 'en',
  en: 'en',
  espanhol: 'es',
  espanol: 'es',
  spanish: 'es',
  es: 'es',
  francês: 'fr',
  frances: 'fr',
  french: 'fr',
  fr: 'fr',
  alemão: 'de',
  alemao: 'de',
  german: 'de',
  de: 'de',
  italiano: 'it',
  italian: 'it',
  it: 'it',
};

const LANGUAGE_LABELS: Partial<Record<SupportedLanguage, string>> = {
  pt: 'português',
  en: 'inglês',
  es: 'espanhol',
  fr: 'francês',
  de: 'alemão',
  it: 'italiano',
  zh: 'chinês',
  ja: 'japonês',
  ko: 'coreano',
  ru: 'russo',
};

const ADAPT_STYLE_LABELS: Record<string, string> = {
  academic: 'acadêmico',
  professional: 'profissional',
  simplified: 'simplificado',
};

export type CustomSkillWholeDocumentAction = {
  type: 'whole-document';
  command: string;
  operation: SkillOperation;
  prompt: string;
  targetLanguage?: SupportedLanguage;
  adaptStyle?: 'academic' | 'professional' | 'simplified' | 'custom';
  targetAudience?: string;
};

export type CustomSkillAction = CustomSkillWholeDocumentAction;

export function findCustomSkillInSettings(
  cmd: string,
  customSkills?: CustomSkill[]
): CustomSkill | undefined {
  if (!customSkills?.length) return undefined;
  return customSkills.find((s) => s.name.toLowerCase() === cmd.toLowerCase());
}

export function resolveCustomSkillAction(
  skill: CustomSkill,
  userArgs?: string
): CustomSkillAction | { error: string } {
  const command = skill.name;

  if (skill.operation === 'translate') {
    const langToken = userArgs?.toLowerCase().split(/\s+/)[0] || 'en';
    const lang = LANGUAGE_MAP[langToken];
    if (!lang) {
      return {
        error: 'Informe o idioma. Ex: /minha-skill inglês',
      };
    }
    const prompt = composeCustomSkillInstructions(skill, userArgs, {
      language: LANGUAGE_LABELS[lang] || lang,
    });
    if (!prompt.trim()) {
      return { error: `A skill ${skill.name} precisa de um prompt configurado.` };
    }
    return {
      type: 'whole-document',
      command,
      operation: 'translate',
      prompt,
      targetLanguage: lang,
    };
  }

  if (skill.operation === 'adapt') {
    const isPersonalizado = skill.adaptStyle === 'custom' || !skill.adaptStyle;
    const styleLabel = isPersonalizado
      ? 'personalizado'
      : ADAPT_STYLE_LABELS[skill.adaptStyle!] || 'personalizado';
    const prompt = composeCustomSkillInstructions(skill, userArgs, {
      style: styleLabel,
      audience: userArgs || undefined,
    });
    if (!prompt.trim()) {
      return { error: `A skill ${skill.name} precisa de um prompt configurado.` };
    }
    return {
      type: 'whole-document',
      command,
      operation: 'adapt',
      prompt,
      adaptStyle: isPersonalizado ? 'custom' : (skill.adaptStyle as 'academic' | 'professional' | 'simplified'),
      targetAudience: userArgs?.trim() || undefined,
    };
  }

  const instructions = composeCustomSkillInstructions(skill, userArgs);
  if (!instructions.trim()) {
    return { error: `A skill ${skill.name} precisa de um prompt configurado ou argumentos.` };
  }
  return {
    type: 'whole-document',
    command,
    operation: 'adjust',
    prompt: instructions,
  };
}

export function customSkillsToSlashCommands(customSkills?: CustomSkill[]) {
  if (!customSkills?.length) return [];
  return customSkills.map((skill) => ({
    name: skill.name,
    args: '<opcional>',
    example: skill.name,
    description: skill.description || `Skill: ${skill.operation}`,
    icon: null as unknown,
    color: 'text-violet-400',
  }));
}
