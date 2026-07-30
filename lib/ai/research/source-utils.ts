import type { ResearchSource, ResearchSourceType } from './types';

type SourceInput = Partial<Omit<ResearchSource, 'id' | 'domain' | 'sourceType'>> & {
  url?: unknown;
  title?: unknown;
};

const OFFICIAL_DOMAINS = /(^|\.)(gov|jus|leg|edu)\.br$|(^|\.)(gov|gouv)\.[a-z]{2,3}$|(^|\.)go\.[a-z]{2}$|(^|\.)(planalto|senado|camara|lexml|inmetro|abnt|iso)\.|(^|\.)(europa\.eu|oecd\.org|worldbank\.org|imf\.org|un\.org|fatf-gafi\.org)$/i;
const ACADEMIC_DOMAINS = /(^|\.)(doi\.org|scielo\.|scopus\.|pubmed\.|ncbi\.|semanticscholar\.|arxiv\.|researchgate\.)/i;
const NEWS_DOMAINS = /(^|\.)(reuters|apnews|bbc|cnn|folha|estadao|globo)\./i;

export function normalizeHttpUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
    url.hash = '';
    return url.toString();
  } catch {
    return undefined;
  }
}

export function classifySource(domain: string): ResearchSourceType {
  if (OFFICIAL_DOMAINS.test(domain) || domain.endsWith('.int')) return 'official';
  if (ACADEMIC_DOMAINS.test(domain)) return 'academic';
  if (NEWS_DOMAINS.test(domain)) return 'news';
  if (/journal|revista|periodic/i.test(domain)) return 'journal';
  return 'web';
}

export function normalizeSources(inputs: SourceInput[]): ResearchSource[] {
  const byUrl = new Map<string, SourceInput>();
  for (const input of inputs) {
    const url = normalizeHttpUrl(input.url);
    if (!url) continue;
    const key = url.replace(/\/$/, '').toLowerCase();
    const current = byUrl.get(key);
    byUrl.set(key, current ? { ...current, ...input, url } : { ...input, url });
  }

  return Array.from(byUrl.values()).map((input, index) => {
    const url = normalizeHttpUrl(input.url)!;
    const domain = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    const title = typeof input.title === 'string' && input.title.trim() ? input.title.trim() : domain;
    return {
      id: `S${index + 1}`,
      title,
      url,
      domain,
      sourceType: classifySource(domain),
      ...(typeof input.publishedAt === 'string' ? { publishedAt: input.publishedAt } : {}),
      ...(typeof input.excerpt === 'string' ? { excerpt: input.excerpt } : {}),
      ...(typeof input.citedText === 'string' ? { citedText: input.citedText } : {})
    };
  });
}

export function formatResearchEvidence(sources: ResearchSource[]): string {
  if (!sources.length) return 'Nenhuma fonte verificável foi devolvida pela pesquisa.';
  return sources.map((source) => {
    const date = source.publishedAt ? ` | data: ${source.publishedAt}` : '';
    const excerpt = source.excerpt || source.citedText;
    return `[${source.id}] ${source.title} | ${source.url} | tipo: ${source.sourceType}${date}${excerpt ? `\nTrecho: ${excerpt}` : ''}`;
  }).join('\n\n');
}
