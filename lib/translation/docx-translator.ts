import JSZip from 'jszip';
import { parseStringPromise, Builder } from 'xml2js';
import fs from 'fs/promises';
import path from 'path';
import { TranslationOptions, TextElement, TranslationResult, TranslationProgress } from './types';
import { translateTextDirect } from './translate-direct';

function normalizeForMatch(text: string): string {
  return (text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extrai todos os textos de um arquivo DOCX preservando estrutura XML
 */
export async function extractTextsFromDocx(filePath: string): Promise<{
  zip: JSZip;
  textElements: TextElement[];
}> {
  const data = await fs.readFile(filePath);
  const zip = await JSZip.loadAsync(data);

  const textElements: TextElement[] = [];
  let elementId = 0;

  // Arquivos XML que contêm texto (incluindo text boxes)
  const xmlPaths = [
    'word/document.xml',
    'word/header1.xml',
    'word/header2.xml',
    'word/header3.xml',
    'word/footer1.xml',
    'word/footer2.xml',
    'word/footer3.xml',
    'word/endnotes.xml',
    'word/footnotes.xml',
    // Text boxes podem estar em arquivos de shapes
    'word/comments.xml',
    'word/textbox.xml'
  ];

  // Também procura por arquivos header/footer/drawing adicionais dinamicamente
  const allFiles = Object.keys(zip.files);
  const additionalXmlPaths = allFiles.filter(
    (file) =>
      file.startsWith('word/') &&
      file.endsWith('.xml') &&
      !xmlPaths.includes(file) &&
      (file.includes('header') ||
       file.includes('footer') ||
       file.includes('textbox') ||
       file.includes('shape') ||
       file.includes('drawing') ||
       file.includes('chart') ||
       file.includes('diagram'))
  );

  xmlPaths.push(...additionalXmlPaths);

  console.log(`[EXTRACT] Scanning ${xmlPaths.length} XML files for text elements...`);
  if (additionalXmlPaths.length > 0) {
    console.log(`[EXTRACT] Found ${additionalXmlPaths.length} additional XML files:`, additionalXmlPaths);
  }

  for (const xmlPath of xmlPaths) {
    const file = zip.file(xmlPath);
    if (!file) continue;

    const xmlContent = await file.async('string');
    const parsed = await parseStringPromise(xmlContent);

    // Extrai todos os textos dentro de tags <w:t>
    const texts = extractTextsRecursive(parsed, xmlPath, []);

    let addedFromThisFile = 0;
    texts.forEach(({ text, tagPath, textNodes }) => {
      if (text.trim().length > 0) {
        // Detecta se vem de text box (shapes, diagramas, etc)
        const isTextBox = tagPath.includes('v:textbox') ||
                          tagPath.includes('w:txbxContent') ||
                          tagPath.includes('v:shape') ||
                          tagPath.includes('v:roundrect') ||
                          tagPath.includes('v:rect') ||
                          tagPath.includes('w:pict');

        textElements.push({
          id: `elem_${elementId++}`,
          xmlPath,
          tagPath,
          originalText: text,
          textNodes,  // Inclui nós de texto individuais se existirem
          isTextBox   // Marca se é text box
        });
        addedFromThisFile++;

        if (isTextBox) {
          console.log(`[EXTRACT] 📦 Text box detected (ID: ${elementId - 1}):\n  Path: ${tagPath}\n  Text: "${text.substring(0, 80)}${text.length > 80 ? '...' : ''}"\n  Has ${textNodes?.length || 0} fragments`);
        }
      }
    });

    if (addedFromThisFile > 0) {
      console.log(`[EXTRACT] ${xmlPath}: ${addedFromThisFile} text elements`);
    }
  }

  return { zip, textElements };
}

/**
 * Extrai textos de um parágrafo, juntando todos os <w:t> em um único texto
 */
function extractParagraphTexts(
  paragraph: any,
  paragraphPath: string
): Array<{ text: string; tagPath: string; textNodes: Array<{ path: string; originalText: string }> }> {
  const textNodes: Array<{ path: string; originalText: string }> = [];

  // Extrai todos os <w:t> do parágrafo recursivamente
  function findTextNodes(obj: any, currentPath: string[]) {
    if (!obj || typeof obj !== 'object') return;

    const textTags = ['w:t', 'a:t'];
    for (const tag of textTags) {
      if (obj[tag]) {
        const textArray = Array.isArray(obj[tag]) ? obj[tag] : [obj[tag]];
        textArray.forEach((tNode: any, idx: number) => {
          const text = typeof tNode === 'string' ? tNode : (tNode._ || '');
          if (text) {
            textNodes.push({
              path: [...currentPath, `${tag}[${idx}]`].join('/'),
              originalText: text
            });
          }
        });
      }
    }

    // Recursão
    for (const key in obj) {
      if (key === 'w:t' || key === 'a:t') continue; // Já processado acima
      if (Array.isArray(obj[key])) {
        obj[key].forEach((item: any, index: number) => {
          findTextNodes(item, [...currentPath, `${key}[${index}]`]);
        });
      } else if (typeof obj[key] === 'object') {
        findTextNodes(obj[key], [...currentPath, key]);
      }
    }
  }

  findTextNodes(paragraph, [paragraphPath]);

  // Se não tem textos, retorna vazio
  if (textNodes.length === 0) return [];

  // Junta todos os textos em um único string
  const fullText = textNodes.map(n => n.originalText).join('');

  // Retorna apenas se tiver conteúdo útil
  if (!fullText.trim()) return [];

  return [{
    text: fullText,
    tagPath: paragraphPath,
    textNodes: textNodes
  }];
}

/**
 * Recursivamente extrai textos de estrutura XML
 * IMPORTANTE: Text boxes são extraídos separadamente, não como parte do parágrafo pai
 */
function extractTextsRecursive(
  obj: any,
  xmlPath: string,
  currentPath: string[],
  context: string[] = []
): Array<{ text: string; tagPath: string; textNodes?: Array<{ path: string; originalText: string }> }> {
  const results: Array<{ text: string; tagPath: string; textNodes?: Array<{ path: string; originalText: string }> }> = [];

  if (!obj || typeof obj !== 'object') {
    return results;
  }

  // 🎯 PRIORITY 1: Extrai text boxes PRIMEIRO (v:textbox ou w:txbxContent)
  // Cada text box é um elemento SEPARADO, não deve ser juntado com outros
  if (obj['w:txbxContent']) {
    const textboxContents = Array.isArray(obj['w:txbxContent']) ? obj['w:txbxContent'] : [obj['w:txbxContent']];
    textboxContents.forEach((txbx, idx) => {
      const txbxPath = [...currentPath, `w:txbxContent[${idx}]`].join('/');
      console.log('[EXTRACT] Found w:txbxContent at path:', txbxPath);

      // Extrai parágrafos DENTRO do text box
      if (txbx['w:p']) {
        const paragraphs = Array.isArray(txbx['w:p']) ? txbx['w:p'] : [txbx['w:p']];
        paragraphs.forEach((para, pIdx) => {
          const paraPath = `${txbxPath}/w:p[${pIdx}]`;
          const extracted = extractParagraphTexts(para, paraPath);
          results.push(...extracted);
        });
      }
    });
    return results; // Não continua recursão - já processou o text box
  }

  // 🎯 PRIORITY 2: Se encontrou parágrafo NORMAL (sem text box acima), extrai textos
  if (obj['w:p']) {
    // Verifica se o parágrafo contém text boxes DENTRO dele
    const paragraphs = Array.isArray(obj['w:p']) ? obj['w:p'] : [obj['w:p']];

    for (let idx = 0; idx < paragraphs.length; idx++) {
      const para = paragraphs[idx];
      const paraPath = [...currentPath, `w:p[${idx}]`].join('/');

      // Checa se tem text boxes dentro deste parágrafo
      const hasTextBoxInside = JSON.stringify(para).includes('txbxContent') ||
                                JSON.stringify(para).includes('v:textbox');

      if (hasTextBoxInside) {
        // Tem text box dentro - faz recursão para extraí-los separadamente
        console.log('[EXTRACT] Paragraph contains text boxes, extracting them individually...');
        results.push(...extractTextsRecursive(para, xmlPath, [...currentPath, `w:p[${idx}]`], context));
      } else {
        // Parágrafo normal - extrai todo o texto junto
        const extracted = extractParagraphTexts(para, paraPath);
        results.push(...extracted);
      }
    }
    return results; // Não continua recursão - já processou os parágrafos
  }

  // 🎯 PRIORITY 3: Para outros containers, continua recursão
  for (const key in obj) {
    if (key === 'w:p' || key === 'w:txbxContent') continue; // Já processados acima

    if (Array.isArray(obj[key])) {
      obj[key].forEach((item: any, index: number) => {
        results.push(
          ...extractTextsRecursive(item, xmlPath, [...currentPath, `${key}[${index}]`], context)
        );
      });
    } else if (typeof obj[key] === 'object') {
      results.push(
        ...extractTextsRecursive(obj[key], xmlPath, [...currentPath, key], context)
      );
    }
  }

  return results;
}

/**
 * Calcula estatísticas de um texto
 */
function calculateTextStats(text: string): {
  chars: number;
  words: number;
  sentences: number;
} {
  return {
    chars: text.length,
    words: text.split(/\s+/).filter(w => w.length > 0).length,
    sentences: text.split(/[.!?]+/).filter(s => s.trim().length > 0).length
  };
}

/**
 * Divide texto longo em partes menores preservando frases completas
 */
function splitLongText(text: string, maxChars: number = 1500): string[] {
  if (text.length <= maxChars) {
    return [text];
  }

  const parts: string[] = [];
  const sentences = text.split(/([.!?]+\s+)/); // Mantém os separadores
  let currentPart = '';

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];

    if ((currentPart + sentence).length > maxChars && currentPart.length > 0) {
      // Chegou no limite, salva a parte atual
      parts.push(currentPart.trim());
      currentPart = sentence;
    } else {
      currentPart += sentence;
    }
  }

  if (currentPart.trim().length > 0) {
    parts.push(currentPart.trim());
  }

  return parts;
}

/**
 * Valida se a tradução é fiel ao original
 * Validação mais flexível para evitar rejeitar traduções válidas
 */
function validateTranslation(original: string, translation: string, isRetry: boolean = false): {
  valid: boolean;
  reason?: string;
} {
  // 1. Verifica se não está vazio
  if (!translation || translation.trim().length === 0) {
    return { valid: false, reason: 'Translation is empty' };
  }

  // 2. Verifica comprimento (mais flexível em retry)
  const originalLen = original.length;
  const translationLen = translation.length;
  const ratio = translationLen / originalLen;

  // Para textos curtos (<100 chars), aceita maior variação
  const minRatio = originalLen < 100 ? 0.3 : (isRetry ? 0.4 : 0.5);
  const maxRatio = originalLen < 100 ? 3.0 : (isRetry ? 2.5 : 2.0);

  if (ratio < minRatio) {
    return { valid: false, reason: `Translation too short (${Math.round(ratio * 100)}% of original)` };
  }
  if (ratio > maxRatio) {
    return { valid: false, reason: `Translation too long (${Math.round(ratio * 100)}% of original)` };
  }

  // 3. Verifica número de sentenças (REMOVIDO - muito restritivo)
  // Comentário: A validação de contagem de sentenças foi removida porque:
  // - Traduções naturais frequentemente alteram a estrutura das frases
  // - Diferentes idiomas têm convenções diferentes de pontuação
  // - Estava causando 80+ falsos positivos, mantendo texto sem traduzir
  // - A validação de comprimento (ratio de caracteres) já é suficiente

  // OPÇÃO ALTERNATIVA: Se quiser manter validação muito flexível, descomente abaixo:
  /*
  const originalSentences = original.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
  const translatedSentences = translation.split(/[.!?]+/).filter(s => s.trim().length > 0).length;

  // Validação MUITO flexível - só rejeita discrepâncias absurdas
  if (originalSentences >= 5) { // Só valida textos com 5+ sentenças
    const sentenceRatio = translatedSentences / Math.max(originalSentences, 1);
    if (sentenceRatio < 0.3 || sentenceRatio > 3.0) { // Tolerância de 300%
      return {
        valid: false,
        reason: `Extreme sentence count mismatch (original: ${originalSentences}, translated: ${translatedSentences})`
      };
    }
  }
  */

  return { valid: true };
}

/**
 * Agrupa textos para otimizar tradução (junta parágrafos até ~1500 chars)
 * IMPORTANTE: NÃO agrupa text boxes - cada um deve ser traduzido separadamente
 */
function groupShortTexts(elements: TextElement[]): Array<{ indices: number[]; text: string; isGroup: boolean }> {
  const TARGET_SIZE = 1500; // Tamanho ideal de cada grupo (caracteres)
  const MAX_SIZE = 2000; // Tamanho máximo permitido
  const groups: Array<{ indices: number[]; text: string; isGroup: boolean }> = [];

  let currentGroup: { indices: number[]; parts: string[]; totalChars: number } | null = null;

  for (let i = 0; i < elements.length; i++) {
    const elem = elements[i];
    const text = elem.originalText;
    const textLen = text.length;

    // 🚫 Text boxes NUNCA são agrupados (cada um traduz separado)
    if (elem.isTextBox) {
      // Finaliza grupo anterior se existir
      if (currentGroup && currentGroup.indices.length > 0) {
        groups.push({
          indices: currentGroup.indices,
          text: currentGroup.parts.join('\n\n'),
          isGroup: currentGroup.indices.length > 1
        });
        currentGroup = null;
      }

      // Adiciona text box individualmente
      groups.push({
        indices: [i],
        text: text,
        isGroup: false
      });
      console.log(`[GROUP] 📦 Text box kept separate: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
      continue;
    }

    // Se o texto sozinho já é muito grande, envia individualmente
    if (textLen > MAX_SIZE) {
      // Finaliza grupo anterior se existir
      if (currentGroup && currentGroup.indices.length > 0) {
        groups.push({
          indices: currentGroup.indices,
          text: currentGroup.parts.join('\n\n'),
          isGroup: currentGroup.indices.length > 1
        });
        currentGroup = null;
      }

      // Adiciona texto grande individualmente
      groups.push({
        indices: [i],
        text: text,
        isGroup: false
      });
      continue;
    }

    // Se não tem grupo, inicia um novo
    if (!currentGroup) {
      currentGroup = { indices: [i], parts: [text], totalChars: textLen };
      continue;
    }

    // Verifica se cabe no grupo atual
    if (currentGroup.totalChars + textLen <= TARGET_SIZE) {
      // Cabe, adiciona
      currentGroup.indices.push(i);
      currentGroup.parts.push(text);
      currentGroup.totalChars += textLen;
    } else {
      // Não cabe, finaliza grupo atual
      groups.push({
        indices: currentGroup.indices,
        text: currentGroup.parts.join('\n\n'),
        isGroup: currentGroup.indices.length > 1
      });

      // Inicia novo grupo com este texto
      currentGroup = { indices: [i], parts: [text], totalChars: textLen };
    }
  }

  // Finaliza último grupo se existir
  if (currentGroup && currentGroup.indices.length > 0) {
    groups.push({
      indices: currentGroup.indices,
      text: currentGroup.parts.join('\n\n'),
      isGroup: currentGroup.indices.length > 1
    });
  }

  return groups;
}

/**
 * Traduz um batch de textos usando IA
 */
async function translateBatch(
  elements: TextElement[],
  options: TranslationOptions,
  stats: { validationPassed: number; validationFailed: number; retriesSucceeded: number; originalKept: number }
): Promise<string[]> {
  const { targetLanguage, sourceLanguage, provider, model } = options;

  // Agrupa parágrafos para otimizar tradução (até ~1500 chars por grupo)
  // IMPORTANTE: Text boxes NÃO são agrupados - cada um traduz separado
  const groups = groupShortTexts(elements);
  const translations: string[] = new Array(elements.length);
  const texts = elements.map(e => e.originalText); // Para compatibilidade com código existente

  console.log(`  📦 Grouped ${elements.length} paragraphs into ${groups.length} batches for translation`);

  // Process 2 groups at a time to reduce API rate limit / timeout (was 5)
  const PARALLEL_LIMIT = 2;
  /** Delay between batch rounds (ms) to avoid bursting and rate limits */
  const DELAY_BETWEEN_BATCHES_MS = 2000;

  for (let batchStart = 0; batchStart < groups.length; batchStart += PARALLEL_LIMIT) {
    const batchEnd = Math.min(batchStart + PARALLEL_LIMIT, groups.length);
    const parallelGroups = groups.slice(batchStart, batchEnd);

    if (batchStart > 0) {
      await new Promise((r) => setTimeout(r, DELAY_BETWEEN_BATCHES_MS));
    }

    console.log(`  ⚡ [${batchStart + 1}-${batchEnd}/${groups.length}] Translating ${parallelGroups.length} groups in parallel...`);

    // Translate groups in parallel using Promise.all
    const parallelPromises = parallelGroups.map(async (group, localIdx) => {
      const groupIdx = batchStart + localIdx;
      const text = group.text;

      // Skip textos muito curtos (números, pontuação, etc)
      if (text.trim().length <= 3) {
        // Mantém o original para textos muito curtos
        for (const idx of group.indices) {
          translations[idx] = texts[idx];
        }
        return;
      }

      try {
      let finalTranslation = '';

      // Se texto for muito longo (>1500 chars), divide em partes
      if (text.length > 1500) {
        const parts = splitLongText(text, 1500);
        console.log(`Splitting long text (${text.length} chars) into ${parts.length} parts`);

        for (const part of parts) {
          const partTranslation = await translateTextDirect(
            part,
            targetLanguage,
            sourceLanguage,
            provider,
            model,
            options.glossary
          );
          finalTranslation += partTranslation + ' ';
        }

        finalTranslation = finalTranslation.trim();
      } else {
        // Texto normal, traduz direto
        finalTranslation = await translateTextDirect(
          text,
          targetLanguage,
          sourceLanguage,
          provider,
          model,
          options.glossary
        );
      }

      // Se for grupo, separa de volta
      if (group.isGroup) {
        // Separa pela quebra dupla de parágrafo
        let parts = finalTranslation.split('\n\n').map(p => p.trim()).filter(p => p.length > 0);

        // Se não funcionou, tenta outras variações
        if (parts.length < group.indices.length) {
          // Tenta com quebra simples
          parts = finalTranslation.split('\n').map(p => p.trim()).filter(p => p.length > 0);
        }

        // Se ainda não funcionou, tenta split por pontos (sentenças)
        if (parts.length < group.indices.length) {
          console.warn(`[WARNING] Expected ${group.indices.length} parts but got ${parts.length}. Attempting sentence-based split...`);
          // Split por pontuação forte
          parts = finalTranslation.split(/(?<=[.!?])\s+/).map(p => p.trim()).filter(p => p.length > 0);
        }

        // Último fallback: usa original
        if (parts.length < group.indices.length) {
          console.warn(`[WARNING] All split strategies failed. Keeping original texts.`);
          for (const idx of group.indices) {
            translations[idx] = texts[idx];
          }
          stats.originalKept += group.indices.length;
        } else {
          // Atribui cada parte ao índice correspondente
          for (let j = 0; j < group.indices.length; j++) {
            const idx = group.indices[j];
            let translatedPart = parts[j] || texts[idx];

            console.log(`[BATCH-DETAIL] Text #${idx}:\n  ORIGINAL: "${texts[idx]}"\n  TRANSLATED: "${translatedPart}"`);

            // Se a parte traduzida não tem espaços mas deveria ter (>10 chars sem espaço)
            if (translatedPart.length > 10 && !translatedPart.includes(' ')) {
              console.warn(`[FIX] Detected merged words (${translatedPart.length} chars): "${translatedPart.substring(0, 50)}..."`);

              // Estratégia 1: camelCase (minúscula seguida de maiúscula)
              translatedPart = translatedPart.replace(/([a-z])([A-Z])/g, '$1 $2');

              // Estratégia 2: Maiúsculas seguidas de minúsculas (OCDE + está = "OCDEestá")
              translatedPart = translatedPart.replace(/([A-Z]{2,})([a-z])/g, '$1 $2');

              // Estratégia 3: Letras seguidas de palavras comuns (está, como, uma, para, etc)
              const commonWords = ['está', 'como', 'uma', 'para', 'com', 'sem', 'por', 'que', 'mais', 'mas', 'tem', 'são', 'foi', 'ser'];
              commonWords.forEach(word => {
                const regex = new RegExp(`([a-záàâãéèêíìîóòôõúùûç])${word}`, 'gi');
                translatedPart = translatedPart.replace(regex, `$1 ${word}`);
              });

              console.log(`[FIX] After fix: "${translatedPart.substring(0, 50)}..."`);
            }

            translations[idx] = translatedPart;
          }
          stats.validationPassed += group.indices.length;
        }
        return; // Exit early for groups
      }

      // Valida a tradução (apenas para textos individuais)
      const validation = validateTranslation(text, finalTranslation);

      if (!validation.valid) {
        stats.validationFailed++;
        console.warn(`❌ Translation validation failed: ${validation.reason}`);
        console.warn(`Original (${text.length} chars): ${text.substring(0, 100)}...`);
        console.warn(`Translation (${finalTranslation.length} chars): ${finalTranslation.substring(0, 100)}...`);

        // 🔄 RETRY STRATEGY: Tenta até 3 vezes com diferentes abordagens
        let retrySuccess = false;

        // RETRY 1: Para textos longos (>1500), divide em chunks menores
        if (text.length > 1500) {
          console.log('🔄 Retry 1/3: Splitting into smaller chunks (800 chars)...');
          const smallerParts = splitLongText(text, 800);
          finalTranslation = '';

          for (const part of smallerParts) {
            const partTranslation = await translateTextDirect(
              part,
              targetLanguage,
              sourceLanguage,
              provider,
              model,
              options.glossary
            );
            finalTranslation += partTranslation + ' ';
          }

          finalTranslation = finalTranslation.trim();
          const retryValidation = validateTranslation(text, finalTranslation, true);

          if (retryValidation.valid) {
            console.log('✅ Retry 1 succeeded!');
            stats.retriesSucceeded++;
            retrySuccess = true;
          } else {
            console.warn(`❌ Retry 1 failed: ${retryValidation.reason}`);
          }
        }

        // RETRY 2: Tenta novamente direto (pode pegar outro provider no fallback)
        if (!retrySuccess) {
          console.log('🔄 Retry 2/3: Retrying direct translation (may use fallback provider)...');
          try {
            finalTranslation = await translateTextDirect(
              text,
              targetLanguage,
              sourceLanguage,
              provider,
              model,
              options.glossary
            );

            const retry2Validation = validateTranslation(text, finalTranslation, true);
            if (retry2Validation.valid) {
              console.log('✅ Retry 2 succeeded!');
              stats.retriesSucceeded++;
              retrySuccess = true;
            } else {
              console.warn(`❌ Retry 2 failed: ${retry2Validation.reason}`);
            }
          } catch (error: any) {
            console.warn(`❌ Retry 2 error: ${error.message}`);
          }
        }

        // RETRY 3: Última tentativa com chunks ainda menores (500 chars)
        if (!retrySuccess && text.length > 500) {
          console.log('🔄 Retry 3/3: Last attempt with very small chunks (500 chars)...');
          const tinyParts = splitLongText(text, 500);
          finalTranslation = '';

          for (const part of tinyParts) {
            try {
              const partTranslation = await translateTextDirect(
                part,
                targetLanguage,
                sourceLanguage,
                provider,
                model,
                options.glossary
              );
              finalTranslation += partTranslation + ' ';
            } catch (error: any) {
              console.error(`Error translating tiny part: ${error.message}`);
              finalTranslation += part + ' '; // Mantém original desta parte
            }
          }

          finalTranslation = finalTranslation.trim();
          const retry3Validation = validateTranslation(text, finalTranslation, true);

          if (retry3Validation.valid) {
            console.log('✅ Retry 3 succeeded!');
            stats.retriesSucceeded++;
            retrySuccess = true;
          } else {
            console.warn(`❌ Retry 3 failed: ${retry3Validation.reason}`);
          }
        }

        // SEMPRE usa a tradução, mesmo se todas as tentativas falharam
        // Melhor ter uma tradução imperfeita do que deixar no original
        if (!retrySuccess) {
          stats.originalKept++;
          console.warn(`⚠️ All retries failed validation, but using translation anyway (quality may vary).`);
        }

        // SEMPRE usa a última tradução disponível
        for (const idx of group.indices) {
          translations[idx] = finalTranslation;
        }
      } else {
        stats.validationPassed++;
        for (const idx of group.indices) {
          translations[idx] = finalTranslation;
          console.log(`[BATCH-DETAIL] Text #${idx}:\n  ORIGINAL: "${texts[idx]}"\n  TRANSLATED: "${finalTranslation}"`);
        }
      }

      } catch (error: any) {
        console.error(`❌ Critical translation error: ${error.message}`);

        // ÚLTIMA TENTATIVA: Tenta traduzir direto sem validação
        try {
          console.log('🆘 Last attempt: Simple translation without validation...');
          const emergencyTranslation = await translateTextDirect(
            text,
            targetLanguage,
            sourceLanguage,
            provider,
            model,
            options.glossary
          );

          if (emergencyTranslation && emergencyTranslation.trim().length > 0) {
            console.log('✅ Emergency translation succeeded!');
            for (const idx of group.indices) {
              translations[idx] = emergencyTranslation;
            }
            stats.retriesSucceeded++;
          } else {
            // Se até a emergência falhar, usa o original
            console.error('⚠️ Even emergency translation failed. Keeping original.');
            stats.originalKept++;
            for (const idx of group.indices) {
              translations[idx] = texts[idx];
            }
          }
        } catch (emergencyError: any) {
          console.error(`⚠️ Emergency translation also failed: ${emergencyError.message}. Keeping original.`);
          stats.originalKept++;
          for (const idx of group.indices) {
            translations[idx] = texts[idx];
          }
        }
      }
    }); // end of parallelPromises.map

    // Wait for all parallel translations to complete
    await Promise.all(parallelPromises);
  } // end of parallel batch loop

  return translations;
}

/**
 * Substitui textos no XML usando objeto parseado (funciona com texto fragmentado)
 */
async function replaceTextsInXml(
  zip: JSZip,
  xmlPath: string,
  elements: TextElement[]
): Promise<void> {
  const file = zip.file(xmlPath);
  if (!file) return;

  const xmlContent = await file.async('string');
  const parsed = await parseStringPromise(xmlContent);

  let replacedCount = 0;

  // Substitui cada elemento usando tagPath
  for (const elem of elements) {
    if (!elem.translatedText || elem.translatedText === elem.originalText) continue;

    console.log(`[REPLACE-DETAIL] Replacing in ${xmlPath}:\n  PATH: ${elem.tagPath}\n  FROM: "${elem.originalText}"\n  TO: "${elem.translatedText}"`);

    // Se tem textNodes, é um texto fragmentado - substitui cada fragmento
    if (elem.textNodes && elem.textNodes.length > 0) {
      console.log(`[REPLACE-DETAIL] 📝 Text is fragmented into ${elem.textNodes.length} nodes, distributing translation...`);
      console.log(`[REPLACE-DETAIL] Fragment paths:`, elem.textNodes.map(n => n.path));

      // Estratégia simples: coloca todo o texto traduzido no primeiro <w:t> e limpa os outros
      for (let i = 0; i < elem.textNodes.length; i++) {
        const textNode = elem.textNodes[i];
        const pathParts = textNode.path.split('/').filter(p => p.length > 0);
        let current: any = parsed;

        // Navega até o <w:t> específico
        for (let j = 0; j < pathParts.length - 1; j++) {
          const part = pathParts[j];
          const match = part.match(/^(.+)\[(\d+)\]$/);
          if (match) {
            const key = match[1];
            const index = parseInt(match[2]);
            current = current?.[key]?.[index];
          } else {
            current = current?.[part];
          }
          if (!current) break;
        }

        if (current) {
          const lastPart = pathParts[pathParts.length - 1];
          const match = lastPart.match(/^(.+)\[(\d+)\]$/);
          const tag = match ? match[1] : lastPart;
          const idx = match ? parseInt(match[2]) : 0;

          if (i === 0) {
            // Primeiro fragmento: substitui com texto traduzido completo
            console.log(`[REPLACE-DETAIL]   Fragment #${i}: Placing full translation here`);
            if (Array.isArray(current[tag])) {
              if (typeof current[tag][idx] === 'string') {
                current[tag][idx] = elem.translatedText;
              } else if (current[tag][idx]?._) {
                current[tag][idx]._ = elem.translatedText;
              }
            } else {
              if (typeof current[tag] === 'string') {
                current[tag] = elem.translatedText;
              } else if (current[tag]?._) {
                current[tag]._ = elem.translatedText;
              }
            }
            replacedCount++;
          } else {
            // Demais fragmentos: limpa (substitui com string vazia)
            console.log(`[REPLACE-DETAIL]   Fragment #${i}: Clearing`);
            if (Array.isArray(current[tag])) {
              if (typeof current[tag][idx] === 'string') {
                current[tag][idx] = '';
              } else if (current[tag][idx]?._) {
                current[tag][idx]._ = '';
              }
            } else {
              if (typeof current[tag] === 'string') {
                current[tag] = '';
              } else if (current[tag]?._) {
                current[tag]._ = '';
              }
            }
          }
        }
      }

      console.log(`[REPLACE-DETAIL] ✅ Successfully distributed translation across ${elem.textNodes.length} fragments`);
    } else {
      // Texto simples (não fragmentado), usa lógica original
      const pathParts = elem.tagPath.split('/').filter(p => p.length > 0);
      let current: any = parsed;

      for (let i = 0; i < pathParts.length; i++) {
        const part = pathParts[i];
        const match = part.match(/^(.+)\[(\d+)\]$/);
        if (match) {
          const key = match[1];
          const index = parseInt(match[2]);
          if (current[key] && Array.isArray(current[key]) && current[key][index]) {
            current = current[key][index];
          } else {
            break;
          }
        } else {
          if (current[part]) {
            current = current[part];
          } else {
            break;
          }
        }
      }

      // Substitui o texto nas tags <w:t> ou <a:t>
      const textTags = ['w:t', 'a:t'];
      let replaced = false;
      for (const tag of textTags) {
        if (current[tag]) {
          const textArray = Array.isArray(current[tag]) ? current[tag] : [current[tag]];

          textArray.forEach((tNode: any) => {
            if (typeof tNode === 'string' && tNode === elem.originalText) {
              current[tag] = elem.translatedText;
              replacedCount++;
              replaced = true;
            } else if (tNode._ && tNode._ === elem.originalText) {
              tNode._ = elem.translatedText;
              replacedCount++;
              replaced = true;
            }
          });
        }
      }

      if (!replaced) {
        console.warn(`[REPLACE-DETAIL] ⚠️ Failed to replace - text not found at path`);
      } else {
        console.log(`[REPLACE-DETAIL] ✅ Successfully replaced`);
      }
    }
  }

  if (replacedCount > 0) {
    console.log(`[REPLACE] ${xmlPath}: ${replacedCount} replacements made (via tagPath)`);
  }

  // Rebuild XML
  const builder = new Builder();
  const newXmlContent = builder.buildObject(parsed);

  // Atualiza o arquivo no ZIP
  zip.file(xmlPath, newXmlContent);
}

export type ApplyDocxSuggestion = {
  id?: string;
  originalText: string;
  improvedText: string;
};

/**
 * Applies accepted suggestion replacements to a DOCX by replacing whole extracted text elements.
 * This is used when the UI lets the user confirm/reject suggestions before generating a new version.
 */
export async function applySuggestionsToDocx(
  inputPath: string,
  outputPath: string,
  acceptedSuggestions: ApplyDocxSuggestion[]
): Promise<{ appliedCount: number; unmatchedCount: number }> {
  const { zip, textElements } = await extractTextsFromDocx(inputPath);

  const index = new Map<string, TextElement[]>();
  for (const el of textElements) {
    const key = normalizeForMatch(el.originalText);
    if (!key) continue;
    const list = index.get(key);
    if (list) list.push(el);
    else index.set(key, [el]);
  }

  let appliedCount = 0;
  let unmatchedCount = 0;

  // Track how many times we've used a given normalized key (handles repeated paragraphs safely).
  const usedOffsets = new Map<string, number>();

  for (const sug of acceptedSuggestions) {
    const key = normalizeForMatch(sug.originalText);
    if (!key) {
      unmatchedCount++;
      continue;
    }
    const candidates = index.get(key);
    if (!candidates || candidates.length === 0) {
      unmatchedCount++;
      continue;
    }

    const offset = usedOffsets.get(key) ?? 0;
    const candidate = candidates[offset];
    if (!candidate) {
      unmatchedCount++;
      continue;
    }

    candidate.translatedText = sug.improvedText;
    usedOffsets.set(key, offset + 1);
    appliedCount++;
  }

  // Replace in each XML section
  const elementsByXml = new Map<string, TextElement[]>();
  for (const el of textElements) {
    if (!elementsByXml.has(el.xmlPath)) elementsByXml.set(el.xmlPath, []);
    elementsByXml.get(el.xmlPath)!.push(el);
  }

  for (const [xmlPath, elements] of elementsByXml.entries()) {
    await replaceTextsInXml(zip, xmlPath, elements);
  }

  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  await fs.writeFile(outputPath, buffer);

  return { appliedCount, unmatchedCount };
}

/**
 * Traduz um documento DOCX completo
 */
export async function translateDocx(
  inputPath: string,
  outputPath: string,
  options: TranslationOptions
): Promise<TranslationResult> {
  const startTime = Date.now();

  // Helper para log duplo (console + callback)
  const log = (message: string) => {
    console.log(message);
    if (options.onLog) {
      options.onLog(message);
    }
  };

  log('\n╔════════════════════════════════════════════════════╗');
  log('║        TRANSLATION STARTED                         ║');
  log('╚════════════════════════════════════════════════════╝');
  log(`📄 Input: ${inputPath}`);
  log(`🌍 Target Language: ${options.targetLanguage.toUpperCase()}`);
  log(`🤖 Provider: ${options.provider} (${options.model})`);

  try {
    // 1. Extrai textos
    log('\n[EXTRACT] 🔍 Extracting text from DOCX...');
    let { zip, textElements } = await extractTextsFromDocx(inputPath);
    log(`[EXTRACT] ✓ Found ${textElements.length} text elements`);

    if (textElements.length === 0) {
      throw new Error('No text found in document');
    }

    // Limita elementos se maxPages foi especificado
    if (options.maxPages && options.maxPages > 0) {
      // Estimativa: ~80-120 elementos por página (dependendo do documento)
      const estimatedElementsPerPage = 100;
      const maxElements = options.maxPages * estimatedElementsPerPage;

      if (textElements.length > maxElements) {
        textElements = textElements.slice(0, maxElements);
        log(`[LIMIT] 🚧 Limited to first ${options.maxPages} pages (~${maxElements} elements)`);
      }
    }

    // 2. Agrupa por arquivo XML
    log('\n[GROUP] 📂 Grouping by XML sections...');
    const elementsByXml = new Map<string, TextElement[]>();
    textElements.forEach(elem => {
      if (!elementsByXml.has(elem.xmlPath)) {
        elementsByXml.set(elem.xmlPath, []);
      }
      elementsByXml.get(elem.xmlPath)!.push(elem);
    });
    log(`[GROUP] ✓ ${elementsByXml.size} sections found: [${Array.from(elementsByXml.keys()).map(k => k.replace('word/', '')).join(', ')}]`);

    // 3. Traduz em batches
    const batchSize = 20; // Traduz 20 textos por vez
    let currentChunk = 0;
    const totalChunks = Math.ceil(textElements.length / batchSize);
    const stats = {
      validationPassed: 0,
      validationFailed: 0,
      retriesSucceeded: 0,
      originalKept: 0
    };

    // Para cálculo de tempo estimado
    const translationStartTime = Date.now();
    const batchTimes: number[] = [];

    for (const [xmlPath, elements] of elementsByXml.entries()) {
      // Processa em batches
      for (let i = 0; i < elements.length; i += batchSize) {
        const batch = elements.slice(i, i + batchSize);

        // Progresso
        currentChunk++;

        // Calcula tempo decorrido e estimado
        const elapsedMs = Date.now() - translationStartTime;
        const elapsedSeconds = Math.round(elapsedMs / 1000);

        // Calcula tempo médio por batch (apenas se já tiver dados)
        let estimatedSecondsRemaining: number | undefined;
        if (batchTimes.length > 0) {
          const avgBatchTimeMs = batchTimes.reduce((a, b) => a + b, 0) / batchTimes.length;
          const remainingChunks = totalChunks - currentChunk;
          estimatedSecondsRemaining = Math.round((remainingChunks * avgBatchTimeMs) / 1000);
        }

        const progress: TranslationProgress = {
          status: 'translating',
          currentChunk,
          totalChunks,
          percentage: Math.round((currentChunk / totalChunks) * 100),
          currentSection: xmlPath.replace('word/', ''),
          elapsedSeconds,
          estimatedSecondsRemaining,
          stats: { ...stats }
        };
        options.onProgress?.(progress);

        log(`\n[TRANSLATE] ⏳ Batch ${currentChunk}/${totalChunks} (${progress.percentage}%) - Section: ${progress.currentSection}`);
        log(`[TRANSLATE] 📝 Processing ${batch.length} text elements...`);

        // Traduz batch (passa elementos completos para detectar text boxes)
        const startBatch = Date.now();
        const translations = await translateBatch(batch, options, stats);
        const batchDuration = Date.now() - startBatch;

        // Registra tempo do batch para estimativa futura
        batchTimes.push(batchDuration);

        log(`[TRANSLATE] ✓ Batch completed in ${(batchDuration / 1000).toFixed(1)}s`);
        log(`[TRANSLATE] 📊 Stats: ✓${stats.validationPassed} passed, ⟳${stats.retriesSucceeded} retried, ⚠${stats.originalKept} kept`);

        // Mapeia traduções para elementos
        batch.forEach((elem, idx) => {
          elem.translatedText = translations[idx];
        });
      }

      // Substitui no XML usando elementos com tagPath
      await replaceTextsInXml(zip, xmlPath, elements);
    }

    // 4. Gera novo DOCX
    log('\n[SAVE] 💾 Generating translated DOCX...');
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    await fs.writeFile(outputPath, buffer);
    log(`[SAVE] ✓ Saved to: ${outputPath}`);

    const durationMs = Date.now() - startTime;

    // Calcula estatísticas finais de validação
    const originalStats = calculateTextStats(textElements.map(e => e.originalText).join(' '));
    const translatedStats = calculateTextStats(textElements.map(e => e.translatedText || '').join(' '));

    const validationReport = {
      originalChars: originalStats.chars,
      translatedChars: translatedStats.chars,
      charRatio: (translatedStats.chars / originalStats.chars * 100).toFixed(1) + '%',
      originalWords: originalStats.words,
      translatedWords: translatedStats.words,
      wordRatio: (translatedStats.words / originalStats.words * 100).toFixed(1) + '%',
      originalSentences: originalStats.sentences,
      translatedSentences: translatedStats.sentences,
      sentenceRatio: (translatedStats.sentences / originalStats.sentences * 100).toFixed(1) + '%',
      validationPassed: stats.validationPassed,
      validationFailed: stats.validationFailed,
      retriesSucceeded: stats.retriesSucceeded,
      keptOriginal: stats.originalKept
    };

    log('\n========== TRANSLATION VALIDATION REPORT ==========');
    log(`Original:    ${originalStats.chars} chars, ${originalStats.words} words, ${originalStats.sentences} sentences`);
    log(`Translated:  ${translatedStats.chars} chars (${validationReport.charRatio}), ${translatedStats.words} words (${validationReport.wordRatio}), ${translatedStats.sentences} sentences (${validationReport.sentenceRatio})`);
    log(`Validation:  ✓ ${stats.validationPassed} passed, ✗ ${stats.validationFailed} failed, ⟳ ${stats.retriesSucceeded} retried, ⚠ ${stats.originalKept} kept original`);
    log('===================================================\n');

    return {
      success: true,
      outputPath,
      elementsTranslated: textElements.length,
      durationMs,
      costEstimatedUsd: estimateCost(textElements, options),
      validationReport
    };

  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      elementsTranslated: 0
    };
  }
}

/**
 * Estima custo da tradução
 */
function estimateCost(elements: TextElement[], options: TranslationOptions): number {
  const totalChars = elements.reduce((sum, e) => sum + e.originalText.length, 0);
  const totalTokens = Math.ceil(totalChars / 4); // Aproximação: 4 chars = 1 token

  // Custos aproximados por 1M tokens (input + output)
  const costs: Record<string, number> = {
    'gpt-5.4': 17.5,
    'gpt-5.4-mini': 5.25,
    'gpt-4o': 7.5,
    'gpt-4o-mini': 0.45,
    'gpt-4-turbo': 20,
    'gemini-3-flash-preview': 0.15,
    'gemini-2.5-flash': 0.15,
    'gemini-2.5-flash-lite': 0.1,
    'gemini-2.5-pro': 3.0,
    'gemini-2.0-flash': 0.15,
    'grok-4-1-fast-non-reasoning': 0.7,
    'grok-4-1-fast-reasoning': 0.7,
    'grok-4.20-0309-non-reasoning': 8,
    'grok-2-1212': 5,
    'grok-2-vision-1212': 5
  };

  const costPer1M = costs[options.model] || 5;
  return (totalTokens * 2 * costPer1M) / 1_000_000; // x2 porque há input + output
}
