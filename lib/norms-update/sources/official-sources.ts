/**
 * Fontes oficiais para verificação de normas brasileiras.
 * Ordem: 1) Senado Federal (API REST), 2) LexML (SRU/portal).
 * Retorna null se a norma não for do tipo suportado ou se nenhuma fonte retornar resultado.
 *
 * Catálogo de APIs governamentais (Data.gov.br / Conecta): para descobrir outras fontes
 * (ex.: Planalto, LexML, Senado), consulte https://www.gov.br/conecta/catalogo/apis
 * e https://dados.gov.br/.
 */

import type { NormReference, NormStatus, UpdateType } from '../types';
import { querySenadoNorm } from './senado';
import { queryLexML } from './lexml';

const BRASILIAN_NORM_TYPES = ['lei', 'decreto', 'portaria', 'resolucao', 'regulamento'] as const;

export type OfficialSourceResult = {
  status: NormStatus;
  updatedNumber?: string;
  updatedDate?: string;
  updateDescription?: string;
  updateType: UpdateType;
  sourceUrl?: string;
  suggestedText?: string;
  confidence: number;
  source: 'senado' | 'lexml';
};

/**
 * Verifica a norma em fontes oficiais (Senado, LexML).
 * Só tenta para tipos brasileiros: lei, decreto, portaria, resolução, regulamento.
 * ABNT/ISO/outro retornam null e devem usar IA.
 */
export async function verifyWithOfficialSources(
  reference: NormReference
): Promise<OfficialSourceResult | null> {
  const type = reference.type?.toLowerCase();
  if (!type || !BRASILIAN_NORM_TYPES.includes(type as any)) {
    return null;
  }

  const number = reference.number?.trim();
  if (!number) return null;

  // 1) Senado (API mais estável para leis/decretos federais)
  try {
    const senadoResult = await querySenadoNorm(type, number);
    if (senadoResult) {
      console.log(`[NORMS] Oficial (Senado): ${reference.number} → ${senadoResult.status}`);
      return {
        ...senadoResult,
        source: 'senado'
      };
    }
  } catch (err) {
    console.warn('[NORMS] Senado failed:', (err as Error).message);
  }

  // 2) LexML
  try {
    const lexmlResult = await queryLexML(type, number);
    if (lexmlResult) {
      console.log(`[NORMS] Oficial (LexML): ${reference.number} → ${lexmlResult.status}`);
      return {
        ...lexmlResult,
        source: 'lexml'
      };
    }
  } catch (err) {
    console.warn('[NORMS] LexML failed:', (err as Error).message);
  }

  return null;
}
