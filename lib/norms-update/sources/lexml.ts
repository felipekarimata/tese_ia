/**
 * Cliente LexML Brasil - Rede de Informação Legislativa e Jurídica.
 * Pesquisa por SRU (Search/Retrieval via URL) ou busca no portal.
 * Documentação: https://projeto.lexml.gov.br/
 */

import { parseStringPromise } from 'xml2js';
import type { NormStatus, UpdateType } from '../types';
import { parseNormNumber, normTypeToSenadoSigla } from '../parse-norm-number';

const REQUEST_TIMEOUT_MS = 15000;

export type LexMLResult = {
  status: NormStatus;
  updatedNumber?: string;
  updatedDate?: string;
  updateDescription?: string;
  updateType: UpdateType;
  sourceUrl?: string;
  suggestedText?: string;
  confidence: number;
};

/**
 * Tenta consultar o LexML via SRU (XML).
 * URL base comum para SRU: portal ou servidor dedicado.
 */
export async function queryLexML(type: string, number: string): Promise<LexMLResult | null> {
  const parsed = parseNormNumber(number);
  if (!parsed.ok || !parsed.year) {
    return null;
  }

  const sigla = normTypeToSenadoSigla(type);
  const numero = parsed.number;
  const ano = parsed.year;

  try {
    // LexML SRU: operação searchRetrieve, query CQL (ex: lei 8078 1990)
    const query = encodeURIComponent(`${sigla} ${numero} ${ano}`);
    const sruUrl = `https://www.lexml.gov.br/sru?operation=searchRetrieve&version=1.2&query=${query}&maximumRecords=5&recordPacking=xml`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const res = await fetch(sruUrl, {
      method: 'GET',
      headers: { Accept: 'application/xml' },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      // Fallback: tentar busca no portal (pode retornar HTML; ignoramos se não for XML)
      return await tryLexMLPortalSearch(type, number, numero, ano);
    }

    const xml = await res.text();
    if (!xml || xml.trim().length === 0) {
      return null;
    }

    const parsedXml = await parseStringPromise(xml, { explicitArray: true });
    return mapLexMLXmlToResult(parsedXml, type, number, ano);
  } catch (err) {
    console.warn('[NORMS] LexML SRU error:', (err as Error).message);
    return await tryLexMLPortalSearch(type, number, numero, ano);
  }
}

/**
 * Fallback: busca no portal LexML (pode retornar HTML).
 * Se a resposta for JSON/XML útil, mapeamos; senão retorna null.
 */
async function tryLexMLPortalSearch(
  type: string,
  number: string,
  numero: string,
  ano: number
): Promise<LexMLResult | null> {
  try {
    const q = encodeURIComponent(`${type} ${numero} ${ano}`);
    const url = `https://www.lexml.gov.br/busca/search?q=${q}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'text/html, application/xml' }
    });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') || '';
    const text = await res.text();
    if (contentType.includes('application/xml') && text.trim().startsWith('<?xml')) {
      const parsed = await parseStringPromise(text, { explicitArray: true });
      return mapLexMLXmlToResult(parsed, type, number, ano);
    }
    // HTML: não fazemos scrape; retornamos null para usar IA
    return null;
  } catch {
    return null;
  }
}

function mapLexMLXmlToResult(
  parsed: any,
  type: string,
  number: string,
  year: number
): LexMLResult | null {
  try {
    const records = parsed?.searchRetrieveResponse?.records ?? parsed?.records ?? [];
    const record = Array.isArray(records) ? records[0] : records;
    if (!record) return null;

    const recordData = record?.recordData ?? record?.record ?? record;
    const doc = recordData?.doc ?? recordData?.documento ?? recordData;
    if (!doc) return null;

    const vigencia = (doc.vigencia ?? doc.Vigencia ?? doc.status)?.[0] ?? doc.vigencia ?? doc.status;
    const vigente = (String(vigencia ?? '').toLowerCase().includes('vigente') || String(vigencia ?? '').toLowerCase().includes('em vigor'));
    const revogada = String(vigencia ?? '').toLowerCase().includes('revogad');
    const substituida = String(vigencia ?? '').toLowerCase().includes('substituíd');

    let status: NormStatus = 'vigente';
    let updateType: UpdateType = 'none';
    let updateDescription = '';

    if (revogada) {
      status = 'revogada';
      updateType = 'auto';
      updateDescription = 'Norma revogada (fonte: LexML Brasil)';
    } else if (substituida) {
      status = 'substituida';
      updateType = 'auto';
      updateDescription = 'Norma substituída (fonte: LexML Brasil)';
    } else if (!vigente && vigencia) {
      status = 'alterada';
      updateType = 'auto';
      updateDescription = String(vigencia);
    }

    const link = doc?.link ?? doc?.url ?? doc?.identificador;
    const sourceUrl = typeof link === 'string' ? link : link?.[0];

    const tipoNorma = type === 'lei' ? 'Lei' : type === 'decreto' ? 'Decreto' : type;
    const suggestedText =
      status !== 'vigente' ? `${tipoNorma} nº ${number} (${updateDescription || status})` : undefined;

    return {
      status,
      updateDescription: updateDescription || (status === 'vigente' ? 'Norma vigente (fonte: LexML Brasil)' : ''),
      updateType,
      sourceUrl,
      suggestedText,
      confidence: 0.85
    };
  } catch {
    return null;
  }
}
