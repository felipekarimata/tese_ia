/**
 * Cliente da API de Dados Abertos do Senado Federal para consulta de normas jurídicas.
 * Documentação: https://legis.senado.leg.br/dadosabertos/
 * Rate limit: máx 10 req/s (retorna 429).
 */

import type { NormStatus, UpdateType } from '../types';
import { parseNormNumber, normTypeToSenadoSigla } from '../parse-norm-number';

const BASE_URL = 'https://legis.senado.leg.br/dadosabertos';
const REQUEST_TIMEOUT_MS = 15000;

export type SenadoNormResult = {
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
 * Consulta a API do Senado por sigla, número e ano.
 * Retorna null se não encontrar ou em caso de erro.
 */
export async function querySenadoNorm(
  type: string,
  number: string
): Promise<SenadoNormResult | null> {
  const parsed = parseNormNumber(number);
  if (!parsed.ok || !parsed.year) {
    return null;
  }

  const sigla = normTypeToSenadoSigla(type);
  const numero = parsed.number;
  const ano = parsed.year;

  try {
    // Endpoint de listagem/pesquisa de matérias (leis, decretos, etc.)
    // Variação comum: /materia/pesquisa/lista ou /materia/{sigla}/{numero}/{ano}
    const url = `${BASE_URL}/materia/${sigla}/${numero}/${ano}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (res.status === 404) {
      return null;
    }

    if (!res.ok) {
      // Tenta endpoint alternativo com query params (alguns catálogos usam)
      const altUrl = `${BASE_URL}/materia/pesquisa/lista?sigla=${encodeURIComponent(sigla)}&numero=${numero}&ano=${ano}`;
      const altRes = await fetch(altUrl, {
        method: 'GET',
        headers: { Accept: 'application/json' }
      });
      if (!altRes.ok) {
        return null;
      }
      const altData = await altRes.json();
      if (!altData || (!altData.DetalheMateria && !altData.Materia && !altData.Materias?.length)) {
        return null;
      }
      return mapSenadoResponseToResult(altData, type, number, ano, sigla);
    }

    const data = await res.json();
    if (!data || (!data.DetalheMateria && !data.Materia && !data.Materias?.length && !data.materia)) {
      return null;
    }
    return mapSenadoResponseToResult(data, type, number, ano, sigla);
  } catch (err) {
    console.warn('[NORMS] Senado API error:', (err as Error).message);
    return null;
  }
}

function mapSenadoResponseToResult(
  data: any,
  type: string,
  number: string,
  year: number,
  sigla: string
): SenadoNormResult {
  // Estrutura varia: pode ser { DetalheMateria: { ... } } ou { ListaMateria: { Materias: [...] } }
  const materia = data?.DetalheMateria ?? data?.Materia ?? data?.materia ?? data?.Materias?.[0] ?? data;
  const situacao = (materia?.SituacaoAtual ?? materia?.situacaoAtual ?? materia?.Situacao ?? materia?.situacao)?.[0] ?? materia?.SituacaoAtual ?? materia?.situacao;
  const nomeSituacao = (typeof situacao === 'string' ? situacao : situacao?.Descricao ?? situacao?.nome ?? '').toLowerCase();

  let status: NormStatus = 'vigente';
  let updateType: UpdateType = 'none';
  let updateDescription = '';
  let updatedNumber: string | undefined;
  let updatedDate: string | undefined;
  let suggestedText: string | undefined;

  if (nomeSituacao.includes('revogad') || nomeSituacao.includes('cancelad')) {
    status = 'revogada';
    updateType = 'auto';
    updateDescription = situacao?.Descricao ?? 'Norma revogada (fonte: Senado Federal)';
  } else if (nomeSituacao.includes('substituíd') || nomeSituacao.includes('substituid')) {
    status = 'substituida';
    updateType = 'auto';
    updateDescription = situacao?.Descricao ?? 'Norma substituída (fonte: Senado Federal)';
  } else if (nomeSituacao.includes('alterad') || nomeSituacao.includes('emend')) {
    status = 'alterada';
    updateType = 'auto';
    updateDescription = situacao?.Descricao ?? 'Norma alterada (fonte: Senado Federal)';
  }

  const tipoNorma = type === 'lei' ? 'Lei' : type === 'decreto' ? 'Decreto' : type;
  if (status !== 'vigente') {
    suggestedText = `${tipoNorma} nº ${number} (${updateDescription || status})`;
  }

  const link = materia?.Link ?? materia?.link ?? data?.link;
  const sourceUrl =
    link || (number && year ? `https://legis.senado.leg.br/norma/${sigla}/${number}/${year}` : undefined);

  return {
    status,
    updatedNumber,
    updatedDate,
    updateDescription: updateDescription || (status === 'vigente' ? 'Norma vigente (fonte: Senado Federal)' : ''),
    updateType,
    sourceUrl,
    suggestedText,
    confidence: 0.9
  };
}
