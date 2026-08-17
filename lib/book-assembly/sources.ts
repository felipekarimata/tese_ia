function normalizeLabel(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

/**
 * Dashboard imports use a generic internal chapter title ("Capítulo 1").
 * The upload/thesis title is the useful label in the global book builder.
 * Real multi-chapter theses keep both labels so chapters remain distinct.
 */
export function formatBookSourceTitle(
  thesisTitle: string,
  chapterTitle: string,
  chapterOrder: number
): string {
  const normalizedChapter = normalizeLabel(chapterTitle);
  const genericChapter = new RegExp(`^capitulo\\s*${chapterOrder}$`).test(normalizedChapter)
    || /^capitulo\s*\d+$/.test(normalizedChapter);

  if (genericChapter || normalizeLabel(thesisTitle) === normalizedChapter) {
    return thesisTitle;
  }
  return `${thesisTitle} — ${chapterTitle}`;
}
