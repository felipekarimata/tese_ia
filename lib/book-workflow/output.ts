const CHAPTER_START = '===INÍCIO DO CAPÍTULO===';
const CHAPTER_END = '===FIM DO CAPÍTULO===';
const REPORT_START = '===RELATÓRIO===';

/** Keeps model commentary and reports out of text that can be applied to a DOCX. */
export function sanitizeEditorialText(value: unknown): string {
  if (typeof value !== 'string') return '';
  let text = value.trim();
  const startIndex = text.indexOf(CHAPTER_START);
  const endIndex = text.indexOf(CHAPTER_END);
  if (startIndex >= 0 && endIndex > startIndex) {
    text = text.slice(startIndex + CHAPTER_START.length, endIndex).trim();
  } else {
    const reportIndex = text.indexOf(REPORT_START);
    if (reportIndex >= 0) text = text.slice(0, reportIndex).trim();
  }

  return text
    .split(/\r?\n/)
    .filter((line) => !/^\s*(?:wait|let me (?:check|think)|everything is correct|espere|deixe-me (?:verificar|pensar)|tudo (?:está|esta) correto)\s*[.!…]*\s*$/i.test(line))
    .join('\n')
    .trim();
}
