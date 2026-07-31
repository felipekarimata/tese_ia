import type { SkillsSettings } from '@/lib/skills/types';
import { BOOK_COMMANDS, CHAPTER_UTILITY_COMMANDS } from '@/lib/book-workflow/commands';

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
  'Use /3 antes ou depois de um comando para comparar vários modelos em paralelo.';

export const MULTI3_PROVIDER_HINT =
  'Sem nomes, usa os padrões de Configurações. Nomes explícitos substituem os padrões.';

export const MULTI3_COMMAND_EXAMPLES: CommandExample[] = [
  { cmd: '/revisar /3', desc: 'Revisar com os provedores e modelos padrão' },
  { cmd: '/ajustar expandir conclusão /3', desc: 'Aplicar /3 depois do comando' },
  { cmd: '/3 /perguntar qual o tema deste capítulo', desc: 'Aplicar /3 antes do comando' },
  { cmd: '/todos /3', desc: 'Pipeline completo com os padrões Multi-IA' },
  { cmd: '/revisar /3 gemini openai', desc: 'Substituir os provedores padrão' },
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
  {
    id: 'chapter-version-tools',
    title: 'Versões do capítulo',
    description: 'Ferramentas visuais disponíveis no agente de capítulos.',
    examples: CHAPTER_UTILITY_COMMANDS.map((command) => ({
      cmd: command.example,
      desc: command.description,
    })),
  },
];

export const AGENT_COMMAND_CATALOG: CommandCategory[] = BASE_CATALOG;

export function buildCommandCatalog(_skills?: SkillsSettings): CommandCategory[] {
  return BASE_CATALOG;
}
