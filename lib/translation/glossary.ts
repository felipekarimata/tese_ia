/**
 * Glossary manager: Handles custom terms that should never be translated
 */

export type GlossaryEntry = {
  term: string;           // Original term (case-sensitive)
  caseSensitive: boolean; // Whether matching should be case-sensitive
  wholeWord: boolean;     // Whether to match whole words only
};

/**
 * Default glossary with common tech terms
 */
export const DEFAULT_GLOSSARY: GlossaryEntry[] = [
  { term: 'Machine Learning', caseSensitive: true, wholeWord: true },
  { term: 'Deep Learning', caseSensitive: true, wholeWord: true },
  { term: 'Artificial Intelligence', caseSensitive: true, wholeWord: true },
  { term: 'AI', caseSensitive: false, wholeWord: true },
  { term: 'Next.js', caseSensitive: true, wholeWord: true },
  { term: 'React', caseSensitive: true, wholeWord: true },
  { term: 'TypeScript', caseSensitive: true, wholeWord: true },
  { term: 'JavaScript', caseSensitive: true, wholeWord: true },
  { term: 'Node.js', caseSensitive: true, wholeWord: true },
  { term: 'API', caseSensitive: false, wholeWord: true },
  { term: 'REST API', caseSensitive: false, wholeWord: true },
  { term: 'GraphQL', caseSensitive: true, wholeWord: true },
  { term: 'Docker', caseSensitive: true, wholeWord: true },
  { term: 'Kubernetes', caseSensitive: true, wholeWord: true },
  { term: 'AWS', caseSensitive: false, wholeWord: true },
  { term: 'Azure', caseSensitive: true, wholeWord: true },
  { term: 'Google Cloud', caseSensitive: true, wholeWord: true },
  { term: 'blockchain', caseSensitive: false, wholeWord: true },
  { term: 'Bitcoin', caseSensitive: true, wholeWord: true },
  { term: 'Ethereum', caseSensitive: true, wholeWord: true },
  { term: 'NFT', caseSensitive: false, wholeWord: true },
  { term: 'Web3', caseSensitive: false, wholeWord: true },
  { term: 'SQL', caseSensitive: false, wholeWord: true },
  { term: 'NoSQL', caseSensitive: true, wholeWord: true },
  { term: 'MongoDB', caseSensitive: true, wholeWord: true },
  { term: 'PostgreSQL', caseSensitive: true, wholeWord: true },
  { term: 'Redis', caseSensitive: true, wholeWord: true },
  { term: 'GitHub', caseSensitive: true, wholeWord: true },
  { term: 'GitLab', caseSensitive: true, wholeWord: true },
  { term: 'CI/CD', caseSensitive: false, wholeWord: true },
  { term: 'DevOps', caseSensitive: true, wholeWord: true },
  { term: 'SaaS', caseSensitive: false, wholeWord: true },
  { term: 'PaaS', caseSensitive: false, wholeWord: true },
  { term: 'IaaS', caseSensitive: false, wholeWord: true }
];

/**
 * Load glossary from localStorage (browser) or return default
 */
export function loadGlossary(): GlossaryEntry[] {
  if (typeof window === 'undefined') {
    return DEFAULT_GLOSSARY;
  }

  try {
    const stored = localStorage.getItem('translation_glossary');
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error('[GLOSSARY] Failed to load from localStorage:', error);
  }

  return DEFAULT_GLOSSARY;
}

/**
 * Save glossary to localStorage
 */
export function saveGlossary(glossary: GlossaryEntry[]): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    localStorage.setItem('translation_glossary', JSON.stringify(glossary));
  } catch (error) {
    console.error('[GLOSSARY] Failed to save to localStorage:', error);
  }
}

/**
 * Add term to glossary
 */
export function addGlossaryTerm(term: string, caseSensitive = true, wholeWord = true): GlossaryEntry[] {
  const glossary = loadGlossary();
  const exists = glossary.some(entry => entry.term === term);

  if (!exists) {
    glossary.push({ term, caseSensitive, wholeWord });
    saveGlossary(glossary);
  }

  return glossary;
}

/**
 * Remove term from glossary
 */
export function removeGlossaryTerm(term: string): GlossaryEntry[] {
  const glossary = loadGlossary();
  const filtered = glossary.filter(entry => entry.term !== term);
  saveGlossary(filtered);
  return filtered;
}

/**
 * Reset glossary to default
 */
export function resetGlossary(): GlossaryEntry[] {
  saveGlossary(DEFAULT_GLOSSARY);
  return DEFAULT_GLOSSARY;
}

/**
 * Protect glossary terms in text by replacing with placeholders
 */
export function protectGlossaryTerms(
  text: string,
  glossary: GlossaryEntry[] = DEFAULT_GLOSSARY
): {
  protectedText: string;
  replacements: Map<string, string>; // placeholder -> original term
} {
  let protectedText = text;
  const replacements = new Map<string, string>();
  let placeholderIndex = 0;

  // Sort by length (longest first) to avoid partial matches
  const sortedGlossary = [...glossary].sort((a, b) => b.term.length - a.term.length);

  for (const entry of sortedGlossary) {
    const { term, caseSensitive, wholeWord } = entry;

    // Build regex based on entry options
    let pattern: RegExp;

    if (wholeWord) {
      // Match whole word with word boundaries
      const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      pattern = new RegExp(
        `\\b${escapedTerm}\\b`,
        caseSensitive ? 'g' : 'gi'
      );
    } else {
      // Match anywhere
      const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      pattern = new RegExp(
        escapedTerm,
        caseSensitive ? 'g' : 'gi'
      );
    }

    // Replace all occurrences
    protectedText = protectedText.replace(pattern, (match) => {
      const placeholder = `__TERM_${placeholderIndex}__`;
      replacements.set(placeholder, match); // Store original match (preserves case)
      placeholderIndex++;
      return placeholder;
    });
  }

  return { protectedText, replacements };
}

/**
 * Restore glossary terms from placeholders
 */
export function restoreGlossaryTerms(
  translatedText: string,
  replacements: Map<string, string>
): string {
  let restoredText = translatedText;

  for (const [placeholder, original] of replacements.entries()) {
    restoredText = restoredText.replace(new RegExp(placeholder, 'g'), original);
  }

  return restoredText;
}
