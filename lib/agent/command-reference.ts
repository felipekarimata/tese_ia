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
  'Use /todos sozinho para executar quatro etapas editoriais com três IAs; o redator final combina as melhores partes das três versões.';

export const MULTI3_PROVIDER_HINT =
  'Os três candidatos, seus modelos e o provedor/modelo do redator final são definidos em Configurações.';

export const MULTI3_COMMAND_EXAMPLES: CommandExample[] = [
  { cmd: '/todos', desc: 'Quatro etapas com 3 IAs + uma redação final combinada' },
];

const BASE_CATALOG: CommandCategory[] = [
  {
    id: 'book-editorial-workflow',
    title: 'Comandos editoriais',
    description: 'Comandos individuais usam o modelo selecionado; /todos usa os três candidatos configurados.',
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
