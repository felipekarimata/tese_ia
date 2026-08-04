export const BOOK_COMMAND_NAMES = [
  '/traduzir',
  '/revisar',
  '/ajustar',
  '/aprimorar',
  '/finalizar',
  '/todos',
] as const;

export type BookCommandName = (typeof BOOK_COMMAND_NAMES)[number];

export type BookCommandDefinition = {
  name: BookCommandName;
  args: string;
  example: string;
  description: string;
};

export const BOOK_COMMANDS: readonly BookCommandDefinition[] = [
  {
    name: '/traduzir',
    args: '',
    example: '/traduzir',
    description: 'Traduz o corpo para pt-BR sem traduzir as notas de rodapé.',
  },
  {
    name: '/revisar',
    args: '',
    example: '/revisar',
    description: 'Verifica vigência, fatos e dados econômicos com pesquisa web.',
  },
  {
    name: '/ajustar',
    args: '<instruções>',
    example: '/ajustar reduzir a seção final em 20%',
    description: 'Cumpre somente a instrução do autor, com alteração conservadora.',
  },
  {
    name: '/aprimorar',
    args: '',
    example: '/aprimorar',
    description: 'Expande e atualiza substancialmente o capítulo com novas fontes.',
  },
  {
    name: '/finalizar',
    args: '',
    example: '/finalizar',
    description: 'Revisa coesão, continuidade e registro final de livro.',
  },
  {
    name: '/todos',
    args: '',
    example: '/todos',
    description: 'Executa traduzir, revisar, aprimorar e finalizar com três IAs e um juiz.',
  },
] as const;

export const CHAPTER_UTILITY_COMMANDS = [
  {
    name: '/comparar',
    args: '[versão 1] [versão 2]',
    example: '/comparar original atual',
    description: 'Abre duas versões lado a lado no agente de capítulos.',
  },
] as const;

export type ChapterUtilityCommandName = (typeof CHAPTER_UTILITY_COMMANDS)[number]['name'];

const BOOK_COMMAND_SET = new Set<string>(BOOK_COMMAND_NAMES);
const CHAPTER_UTILITY_COMMAND_SET = new Set<string>(CHAPTER_UTILITY_COMMANDS.map((command) => command.name));

export function getSlashCommandName(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) return null;
  const spaceIndex = trimmed.indexOf(' ');
  return (spaceIndex === -1 ? trimmed : trimmed.slice(0, spaceIndex)).toLowerCase();
}

export function isBookCommand(command: string): command is BookCommandName {
  return BOOK_COMMAND_SET.has(command.toLowerCase());
}

export function isChapterUtilityCommand(command: string): command is ChapterUtilityCommandName {
  return CHAPTER_UTILITY_COMMAND_SET.has(command.toLowerCase());
}

export function disabledCommandMessage(command: string): string {
  return `O comando ${command} foi desativado neste fluxo editorial. Comandos ativos: ${BOOK_COMMAND_NAMES.join(', ')}.`;
}
