import type { CustomSkill, SkillsSettings } from '@/lib/skills/types';
import { DEFAULT_SKILLS_SETTINGS } from '@/lib/skills/types';

export type CommandExample = {
  cmd: string;
  desc: string;
};

export type CommandCategory = {
  id: string;
  title: string;
  description?: string;
  examples: CommandExample[];
};

export const MULTI3_SHORT_DESCRIPTION =
  'Compare respostas de vários modelos em paralelo (/3 ou /todos /3).';

export const MULTI3_PROVIDER_HINT =
  'Opcional: /3 openai,gemini,grok ou /3 escolher gemini após comparar.';

export const MULTI3_COMMAND_EXAMPLES: CommandExample[] = [
  { cmd: '/3 gemini openai claude /ajustar expandir conclusão', desc: 'Comparar 3 modelos num ajuste' },
  { cmd: '/3 /ajustar expandir conclusão', desc: 'Multi-IA com ajuste (provedores padrão)' },
  { cmd: '/3 /perguntar qual o tema deste capítulo', desc: 'Pergunta com vários modelos' },
  { cmd: '/todos /3 gemini openai claude', desc: 'Pipeline completo com Multi-IA' },
  { cmd: '/3 escolher gemini', desc: 'Aceitar candidato após comparar' },
  { cmd: '/3 decidir openai', desc: 'Re-juizar com outro modelo' },
];

const BASE_CATALOG: CommandCategory[] = [
  {
    id: 'perguntar',
    title: 'Conversa e consulta',
    examples: [
      { cmd: '/perguntar qual o tema deste capítulo', desc: 'Pergunta sobre o documento' },
      { cmd: '/limpar', desc: 'Limpa o histórico do chat' },
    ],
  },
  {
    id: 'operations',
    title: 'Operações no documento',
    examples: [
      { cmd: '/traduzir en', desc: 'Traduz para inglês (também: pt, es, fr, de, it)' },
      { cmd: '/traduzir português', desc: 'Traduz para português' },
      { cmd: '/adaptar simplificado', desc: 'Tom acessível ao público geral' },
      { cmd: '/adaptar acadêmico', desc: 'Tom acadêmico formal' },
      { cmd: '/adaptar profissional', desc: 'Tom profissional corporativo' },
      { cmd: '/ajustar expandir a conclusão', desc: 'Edição sob instruções (gera nova versão)' },
      { cmd: '/revisar', desc: 'Verifica vigência de leis citadas' },
      { cmd: '/comparar', desc: 'Compara original vs versão atual' },
      { cmd: '/comparar 1 atual', desc: 'Compara versões específicas por número' },
      { cmd: '/todos', desc: 'Pipeline: traduzir pt → adaptar simplificado → revisar leis' },
    ],
  },
  {
    id: 'multi3',
    title: 'Multi-IA',
    description: MULTI3_SHORT_DESCRIPTION,
    examples: MULTI3_COMMAND_EXAMPLES,
  },
];

export const AGENT_COMMAND_CATALOG: CommandCategory[] = BASE_CATALOG;

function normalizeSkillCommandName(name: string): string {
  const trimmed = name.trim();
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

export function buildCommandCatalog(skills?: SkillsSettings): CommandCategory[] {
  const rawCustom = skills?.customSkills ?? DEFAULT_SKILLS_SETTINGS.customSkills;
  const custom = Array.isArray(rawCustom) ? rawCustom : [];
  const validCustom = custom.filter(
    (s): s is CustomSkill => Boolean(s?.name?.trim())
  );
  if (!validCustom.length) return BASE_CATALOG;

  const customCategory: CommandCategory = {
    id: 'custom-skills',
    title: 'Skills personalizadas',
    description: 'Comandos configurados em Configurações → Skills.',
    examples: validCustom.map((s: CustomSkill) => ({
      cmd: normalizeSkillCommandName(s.name),
      desc: s.description || `Operação: ${s.operation}`,
    })),
  };

  return [...BASE_CATALOG.slice(0, 2), customCategory, ...BASE_CATALOG.slice(2)];
}
