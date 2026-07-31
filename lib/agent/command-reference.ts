import type { SkillsSettings } from '@/lib/skills/types';
import { BOOK_COMMANDS } from '@/lib/book-workflow/commands';

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
    id: 'book-editorial-workflow',
    title: 'Tese → livro',
    description: 'Cinco etapas editoriais com revisão humana entre cada saída.',
    examples: BOOK_COMMANDS.map((command) => ({
      cmd: command.example,
      desc: command.description,
    })),
  },
];

export const AGENT_COMMAND_CATALOG: CommandCategory[] = BASE_CATALOG;

export function buildCommandCatalog(_skills?: SkillsSettings): CommandCategory[] {
  return BASE_CATALOG;
}
