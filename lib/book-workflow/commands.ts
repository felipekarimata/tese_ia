export const BOOK_COMMAND_NAMES = [
  '/traduzir',
  '/revisar',
  '/ajustar',
  '/aprimorar',
  '/finalizar',
  '/livro',
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
    name: '/livro',
    args: '<instrução P3>',
    example: '/livro preservar a conclusão original',
    description: 'Executa os cinco passos, com aprovação explícita entre eles.',
  },
] as const;

const BOOK_COMMAND_SET = new Set<string>(BOOK_COMMAND_NAMES);

export function getSlashCommandName(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) return null;
  const spaceIndex = trimmed.indexOf(' ');
  return (spaceIndex === -1 ? trimmed : trimmed.slice(0, spaceIndex)).toLowerCase();
}

export function isBookCommand(command: string): command is BookCommandName {
  return BOOK_COMMAND_SET.has(command.toLowerCase());
}

export function disabledCommandMessage(command: string): string {
  return `O comando ${command} foi desativado neste fluxo editorial. Comandos ativos: ${BOOK_COMMAND_NAMES.join(', ')}.`;
}
