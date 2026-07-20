/**
 * Adjust Operation Types
 * For following custom user instructions to modify documents
 */

export interface AdjustSuggestion {
  id: string;
  paragraphIndex: number;
  sectionTitle?: string;
  originalText: string;
  adjustedText: string;
  reason: string; // Why this adjustment was made based on instructions
  instructionReference: string; // Which part of the instructions this addresses
}

export interface AdjustJobResult {
  documentId: string;
  instructions: string;
  creativity: number;
  provider: string;
  model: string;
  suggestions: AdjustSuggestion[];
  totalParagraphs: number;
  adjustedParagraphs: number;
  status: 'pending' | 'analyzing' | 'completed' | 'failed';
  error?: string;
}
