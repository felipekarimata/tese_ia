import { AIProvider } from '../ai/types';

export type SupportedLanguage =
  | 'en' // Inglês
  | 'pt' // Português
  | 'es' // Espanhol
  | 'fr' // Francês
  | 'de' // Alemão
  | 'it' // Italiano
  | 'zh' // Chinês
  | 'ja' // Japonês
  | 'ko' // Coreano
  | 'ru'; // Russo

export const LANGUAGE_NAMES: Record<SupportedLanguage, string> = {
  en: 'English',
  pt: 'Português',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  it: 'Italiano',
  zh: '中文',
  ja: '日本語',
  ko: '한국어',
  ru: 'Русский'
};

export type TranslationProgress = {
  status: 'pending' | 'translating' | 'completed' | 'error';
  currentChunk: number;
  totalChunks: number;
  percentage: number;
  currentSection?: string; // document, header1, footer1, etc
  error?: string;
  estimatedSecondsRemaining?: number; // Tempo estimado restante em segundos
  elapsedSeconds?: number; // Tempo decorrido desde o início
  stats?: {
    validationPassed: number;
    validationFailed: number;
    retriesSucceeded: number;
    originalKept: number; // Textos que mantiveram o original por falha
  };
};

export type TranslationOptions = {
  targetLanguage: SupportedLanguage;
  sourceLanguage?: SupportedLanguage; // Auto-detect se não especificado
  provider: AIProvider;
  model: string;
  chunkSize?: number; // Tamanho do chunk de texto (default: 2000)
  maxPages?: number; // Limita tradução às primeiras N páginas (útil para testes)
  glossary?: Array<{ term: string; caseSensitive: boolean; wholeWord: boolean }>; // Termos que não devem ser traduzidos
  onProgress?: (progress: TranslationProgress) => void;
  onLog?: (message: string) => void; // Callback para logs em tempo real
};

export type TextElement = {
  id: string;
  xmlPath: string; // Ex: "word/document.xml", "word/header1.xml"
  tagPath: string; // XPath simplificado para localizar o elemento
  originalText: string;
  translatedText?: string;
  context?: string; // Contexto ao redor (parágrafo anterior/posterior)
  textNodes?: Array<{ path: string; originalText: string }>; // Nós de texto individuais (quando juntados de múltiplos <w:t>)
  isTextBox?: boolean; // Se vem de text box/shape (não deve ser agrupado com outros)
};

export type TranslationResult = {
  success: boolean;
  outputPath?: string;
  elementsTranslated: number;
  error?: string;
  costEstimatedUsd?: number;
  durationMs?: number;
  validationReport?: {
    originalChars: number;
    translatedChars: number;
    charRatio: string;
    originalWords: number;
    translatedWords: number;
    wordRatio: string;
    originalSentences: number;
    translatedSentences: number;
    sentenceRatio: string;
    validationPassed: number;
    validationFailed: number;
    retriesSucceeded: number;
    keptOriginal: number;
  };
};
