/**
 * Parser para número e ano de normas brasileiras.
 * Ex.: "8.078/1990", "Lei 8.078/1990", "10.024/2019", "NBR 14724:2011"
 */

export type ParsedNormNumber = {
  number: string;   // número limpo (ex: 8078, 10024)
  year: number;     // ano (ex: 1990, 2019)
  raw: string;      // número original
  ok: boolean;      // se conseguiu extrair número e ano
};

/**
 * Extrai número e ano de uma string de norma.
 * Aceita formatos: "8.078/1990", "8078/1990", "Lei 8.078/1990", "10.024/2019", "Decreto 10024/2019"
 */
export function parseNormNumber(input: string): ParsedNormNumber {
  const raw = (input || '').trim();
  if (!raw) {
    return { number: '', year: 0, raw, ok: false };
  }

  // Remove prefixos comuns (Lei, Decreto, Portaria, etc.) e mantém número/ano
  const withoutPrefix = raw
    .replace(/^(lei|decreto|portaria|resolução|resolucao|medida\s+provisória|mp|emenda\s+constitucional|ec)\s*(n[º°.]?\s*)?/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Padrão: número (com ou sem pontos) / ano   ex: 8.078/1990, 8078/1990, 10.024/2019
  const match = withoutPrefix.match(/(\d[\d.]*)\s*\/\s*(\d{4})/);
  if (match) {
    const numStr = match[1].replace(/\./g, '');
    const year = parseInt(match[2], 10);
    if (numStr && year >= 1900 && year <= 2100) {
      return { number: numStr, year, raw, ok: true };
    }
  }

  // Padrão: só ano no final (ex: Lei 8078 de 1990)
  const matchYear = withoutPrefix.match(/(\d{4})/);
  const matchNum = withoutPrefix.match(/(\d[\d.]*)/);
  if (matchYear && matchNum) {
    const year = parseInt(matchYear[1], 10);
    const numStr = matchNum[1].replace(/\./g, '');
    if (year >= 1900 && year <= 2100 && numStr) {
      return { number: numStr, year, raw, ok: true };
    }
  }

  return { number: raw.replace(/\D/g, '').slice(0, 20) || raw, year: 0, raw, ok: false };
}

/**
 * Sigla do tipo de norma para API do Senado.
 * LEI, DEC (decreto), MPV, EMC, LCP, etc.
 */
export function normTypeToSenadoSigla(type: string): string {
  const map: Record<string, string> = {
    lei: 'LEI',
    decreto: 'DEC',
    portaria: 'PORT',
    resolucao: 'RES',
    regulamento: 'DEC', // pode ser decreto regulamentar
    outro: 'LEI'
  };
  return map[type?.toLowerCase()] || 'LEI';
}
