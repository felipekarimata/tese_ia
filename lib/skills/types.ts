export type SkillKey =
  | 'adjust'
  | 'adapt:academic'
  | 'adapt:professional'
  | 'adapt:simplified'
  | 'translate'
  | 'review'
  | 'todos:translate'
  | 'todos:adapt:academic'
  | 'todos:adapt:professional'
  | 'todos:adapt:simplified'
  | 'todos:review';

export type SkillOperation = 'adjust' | 'adapt' | 'translate';

export type AdaptStyle = 'academic' | 'professional' | 'simplified';

export type CustomSkill = {
  id: string;
  name: string;
  description: string;
  operation: SkillOperation;
  adaptStyle?: AdaptStyle | 'custom';
  prompt: string;
};

export type SkillsSettings = {
  promptOverrides: Partial<Record<SkillKey, string>>;
  customSkills: CustomSkill[];
};

export type SkillContext = 'direct' | 'todos';

export type SkillPromptVars = {
  args?: string;
  style?: string;
  section?: string;
  paragraphs?: string;
  document?: string;
  creativity?: number;
  audience?: string;
  language?: string;
};

export const RESERVED_COMMANDS = new Set([
  '/3',
  '/limpar',
  '/todos',
  '/comparar',
  '/perguntar',
  '/traduzir',
  '/adaptar',
  '/ajustar',
  '/revisar',
]);

export const DEFAULT_SKILLS_SETTINGS: SkillsSettings = {
  promptOverrides: {},
  customSkills: [],
};

export const SKILL_KEY_LABELS: Record<SkillKey, string> = {
  adjust: '/ajustar',
  'adapt:academic': '/adaptar acadêmico',
  'adapt:professional': '/adaptar profissional',
  'adapt:simplified': '/adaptar simplificado',
  translate: '/traduzir',
  review: '/revisar',
  'todos:translate': '/todos — traduzir',
  'todos:adapt:academic': '/todos — adaptar acadêmico',
  'todos:adapt:professional': '/todos — adaptar profissional',
  'todos:adapt:simplified': '/todos — adaptar simplificado',
  'todos:review': '/todos — revisar leis',
};

export const BUILTIN_SKILL_KEYS: SkillKey[] = [
  'adjust',
  'adapt:academic',
  'adapt:professional',
  'adapt:simplified',
  'translate',
  'review',
  'todos:translate',
  'todos:adapt:academic',
  'todos:adapt:professional',
  'todos:adapt:simplified',
  'todos:review',
];
