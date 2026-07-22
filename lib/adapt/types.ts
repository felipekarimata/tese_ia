/**
 * Adapt Operation Types
 * Style and audience adaptation
 */

export interface AdaptationSuggestion {
  id: string;
  originalText: string;
  adaptedText: string;
  reason: string;
  sectionTitle: string;
  adaptationType: 'style' | 'tone' | 'terminology' | 'structure';
}
