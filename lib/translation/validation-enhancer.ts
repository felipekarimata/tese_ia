/**
 * Enhanced validation: Protects numbers, dates, and proper nouns during translation
 */

export type ProtectedElements = {
  numbers: Map<string, string>;    // placeholder -> original number
  dates: Map<string, string>;      // placeholder -> original date
  properNouns: Map<string, string>; // placeholder -> original proper noun
};

/**
 * Regex patterns for detection
 */
const PATTERNS = {
  // Numbers: 123, 1,234, 1.234, 45.67%, $100, etc
  number: /\b\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?%?\b|\$\d+(?:[.,]\d+)?/g,

  // Dates: 2024-01-15, 15/01/2024, 01-15-2024, Jan 15 2024, etc
  date: /\b\d{1,4}[-/]\d{1,2}[-/]\d{1,4}\b|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2},? \d{4}\b/gi,

  // Proper nouns: Words that start with capital letter in middle of sentence
  // Ignora primeira palavra da frase e palavras depois de pontuação
  properNoun: /(?<!^|\. |\.\s|\?\s|!\s|:\s)\b[A-Z][a-zà-ÿ]+(?:\s[A-Z][a-zà-ÿ]+)*\b/g
};

/**
 * Protects numbers, dates, and proper nouns by replacing with placeholders
 */
export function protectElements(text: string): {
  protectedText: string;
  elements: ProtectedElements;
} {
  let protectedText = text;
  const elements: ProtectedElements = {
    numbers: new Map(),
    dates: new Map(),
    properNouns: new Map()
  };

  // 1. Protect dates first (before numbers, since dates contain numbers)
  let dateIndex = 0;
  protectedText = protectedText.replace(PATTERNS.date, (match) => {
    const placeholder = `__DATE_${dateIndex}__`;
    elements.dates.set(placeholder, match);
    dateIndex++;
    return placeholder;
  });

  // 2. Protect numbers
  let numberIndex = 0;
  protectedText = protectedText.replace(PATTERNS.number, (match) => {
    const placeholder = `__NUM_${numberIndex}__`;
    elements.numbers.set(placeholder, match);
    numberIndex++;
    return placeholder;
  });

  // 3. Protect proper nouns (optional - pode ser muito agressivo)
  // Comentado por padrão, pode ser ativado se necessário
  /*
  let nounIndex = 0;
  protectedText = protectedText.replace(PATTERNS.properNoun, (match) => {
    const placeholder = `__NAME_${nounIndex}__`;
    elements.properNouns.set(placeholder, match);
    nounIndex++;
    return placeholder;
  });
  */

  return { protectedText, elements };
}

/**
 * Restores original values from placeholders
 */
export function restoreElements(
  translatedText: string,
  elements: ProtectedElements
): string {
  let restoredText = translatedText;

  // Restore in reverse order: proper nouns -> numbers -> dates
  for (const [placeholder, original] of elements.properNouns.entries()) {
    restoredText = restoredText.replace(new RegExp(placeholder, 'g'), original);
  }

  for (const [placeholder, original] of elements.numbers.entries()) {
    restoredText = restoredText.replace(new RegExp(placeholder, 'g'), original);
  }

  for (const [placeholder, original] of elements.dates.entries()) {
    restoredText = restoredText.replace(new RegExp(placeholder, 'g'), original);
  }

  return restoredText;
}

/**
 * Validates that all placeholders were preserved in translation
 */
export function validatePlaceholders(
  originalText: string,
  translatedText: string,
  elements: ProtectedElements
): {
  valid: boolean;
  missing: string[];
  extra: string[];
} {
  const allPlaceholders = [
    ...Array.from(elements.numbers.keys()),
    ...Array.from(elements.dates.keys()),
    ...Array.from(elements.properNouns.keys())
  ];

  const missing: string[] = [];
  const extra: string[] = [];

  // Check which placeholders are missing
  for (const placeholder of allPlaceholders) {
    if (!translatedText.includes(placeholder)) {
      missing.push(placeholder);
    }
  }

  // Check for extra placeholders (shouldn't happen but good to verify)
  const placeholderPattern = /__(?:NUM|DATE|NAME)_\d+__/g;
  const foundPlaceholders = translatedText.match(placeholderPattern) || [];

  for (const found of foundPlaceholders) {
    if (!allPlaceholders.includes(found)) {
      extra.push(found);
    }
  }

  return {
    valid: missing.length === 0 && extra.length === 0,
    missing,
    extra
  };
}
