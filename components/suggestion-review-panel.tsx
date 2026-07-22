'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  CheckCircle2,
  XCircle,
  Info,
  Download,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';

export interface Suggestion {
  id: string;
  type: string;
  originalText: string;
  improvedText: string;
  reason: string;
  confidence: number;
  chapterTitle?: string;
  position?: {
    start: number;
    end: number;
  };
}

export interface SuggestionReviewPanelProps {
  suggestions: Suggestion[];
  documentTitle: string;
  fullDocumentText: string;
  onApply: (acceptedIds: string[]) => Promise<void>;
  typeLabels?: Record<string, { label: string; color: string }>;
  showPipelineMode?: boolean;
  pipelineId?: string;
}

const DEFAULT_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  grammar: { label: 'Gramática', color: 'bg-red-500' },
  style: { label: 'Estilo', color: 'bg-blue-500' },
  clarity: { label: 'Clareza', color: 'bg-green-500' },
  coherence: { label: 'Coerência', color: 'bg-purple-500' },
  conciseness: { label: 'Concisão', color: 'bg-orange-500' },
  translation: { label: 'Tradução', color: 'bg-cyan-500' },
  adjustment: { label: 'Ajuste', color: 'bg-yellow-500' },
  adaptation: { label: 'Adaptação', color: 'bg-pink-500' },
  update: { label: 'Atualização', color: 'bg-indigo-500' }
};

export function SuggestionReviewPanel({
  suggestions,
  documentTitle,
  fullDocumentText,
  onApply,
  typeLabels = DEFAULT_TYPE_LABELS,
  showPipelineMode = false,
  pipelineId
}: SuggestionReviewPanelProps) {
  const [acceptedSuggestions, setAcceptedSuggestions] = useState<Set<string>>(new Set());
  const [hoveredSuggestionId, setHoveredSuggestionId] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  const toggleSuggestion = (suggestionId: string) => {
    setAcceptedSuggestions(prev => {
      const next = new Set(prev);
      if (next.has(suggestionId)) {
        next.delete(suggestionId);
      } else {
        next.add(suggestionId);
      }
      return next;
    });
  };

  const scrollToSuggestion = (suggestionId: string) => {
    const element = document.querySelector(`[data-suggestion-id="${suggestionId}"]`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const acceptAll = () => {
    setAcceptedSuggestions(new Set(suggestions.map(s => s.id)));
    toast.success(`${suggestions.length} sugestões aceitas`);
  };

  const rejectAll = () => {
    setAcceptedSuggestions(new Set());
    toast.success('Todas as sugestões rejeitadas');
  };

  const handleApply = async () => {
    if (acceptedSuggestions.size === 0) {
      toast.error('Selecione pelo menos uma sugestão');
      return;
    }

    try {
      setApplying(true);
      await onApply(Array.from(acceptedSuggestions));
    } catch (error: any) {
      toast.error(error.message || 'Erro ao aplicar sugestões');
    } finally {
      setApplying(false);
    }
  };

  // Group suggestions by chapter
  const suggestionsByChapter = suggestions.reduce((acc, sug) => {
    const chapter = sug.chapterTitle || 'Sem capítulo';
    if (!acc[chapter]) acc[chapter] = [];
    acc[chapter].push(sug);
    return acc;
  }, {} as Record<string, Suggestion[]>);

  const acceptedCount = acceptedSuggestions.size;
  const totalCount = suggestions.length;

  // Highlight text in document
  const getHighlightedDocument = () => {
    if (!fullDocumentText) return '';

    let highlightedText = fullDocumentText;
    const sortedSuggestions = [...suggestions].sort((a, b) => {
      if (!a.position || !b.position) return 0;
      return b.position.start - a.position.start; // Reverse order to avoid offset issues
    });

    sortedSuggestions.forEach(sug => {
      if (!sug.position) return;

      const { start, end } = sug.position;
      const isAccepted = acceptedSuggestions.has(sug.id);
      const isHovered = hoveredSuggestionId === sug.id;

      const before = highlightedText.slice(0, start);
      const text = highlightedText.slice(start, end);
      const after = highlightedText.slice(end);

      const highlightClass = isHovered
        ? 'bg-yellow-200 dark:bg-yellow-900/50 text-gray-900 dark:text-white border-2 border-yellow-400 dark:border-yellow-600 shadow-lg shadow-yellow-400/50 scale-105 inline-block transition-all duration-200'
        : isAccepted
        ? 'bg-green-100 dark:bg-green-900/30 text-gray-900 dark:text-white border-b-4 border-green-500 dark:border-green-600 transition-all duration-200'
        : 'bg-red-100 dark:bg-red-900/30 text-gray-900 dark:text-white border-b-4 border-red-500 dark:border-red-600 transition-all duration-200';

      highlightedText = `${before}<mark class="${highlightClass} cursor-pointer px-1 py-0.5 rounded-sm" data-suggestion-id="${sug.id}">${text}</mark>${after}`;
    });

    return highlightedText;
  };

  return (
    <div className="space-y-4">
      {/* Sticky Header with Stats and Actions */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b pb-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Revisar Sugestões</h2>
            <p className="text-muted-foreground mt-1">
              Selecione as alterações que deseja aplicar ao documento
            </p>
          </div>
        </div>

        {/* Stats Bar */}
        <div className="flex items-center gap-4 mb-3">
          <div className="flex items-center gap-2 px-4 py-2 bg-red-50 dark:bg-red-950 rounded-lg border border-red-200 dark:border-red-800">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-sm font-medium text-red-900 dark:text-red-100">
              {totalCount} {totalCount === 1 ? 'sugestão' : 'sugestões'}
            </span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
            <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
            <span className="text-sm font-medium text-green-900 dark:text-green-100">
              {acceptedCount} {acceptedCount === 1 ? 'aceita' : 'aceitas'}
            </span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800">
            <XCircle className="w-4 h-4 text-gray-600 dark:text-gray-400" />
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {totalCount - acceptedCount} {totalCount - acceptedCount === 1 ? 'rejeitada' : 'rejeitadas'}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={acceptAll}
            className="hover:bg-green-50 hover:text-green-700 hover:border-green-300"
          >
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Aceitar Todas
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={rejectAll}
            className="hover:bg-red-50 hover:text-red-700 hover:border-red-300"
          >
            <XCircle className="mr-2 h-4 w-4" />
            Rejeitar Todas
          </Button>
          <div className="flex-1" />
          <Button
            onClick={handleApply}
            disabled={acceptedCount === 0 || applying}
            size="lg"
            className={`${showPipelineMode
              ? 'bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800'
              : 'bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800'
            } text-white shadow-lg transition-all duration-200 ${
              acceptedCount > 0 ? 'scale-105' : ''
            }`}
          >
            {applying ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                {showPipelineMode ? 'Aprovando...' : 'Aplicando...'}
              </>
            ) : (
              <>
                {showPipelineMode ? (
                  <>
                    <CheckCircle2 className="mr-2 h-5 w-5" />
                    Aprovar e Continuar {acceptedCount > 0 ? `(${acceptedCount})` : ''}
                  </>
                ) : (
                  <>
                    <Download className="mr-2 h-5 w-5" />
                    Aplicar Sugestões {acceptedCount > 0 ? `(${acceptedCount})` : ''}
                  </>
                )}
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Split View: Suggestions List + Document Preview */}
      <div className="grid grid-cols-2 gap-6">
        {/* Left: Suggestions List */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Sugestões</CardTitle>
              <CardDescription>
                Passe o mouse sobre uma sugestão para ver sua localização no documento
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[calc(100vh-300px)]">
                <div className="space-y-6">
                  {totalCount === 0 ? (
                    <div className="py-20 text-center">
                      <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-red-50 to-red-100 dark:from-red-950 dark:to-red-900 rounded-full flex items-center justify-center">
                        <Info className="h-10 w-10 text-red-500" />
                      </div>
                      <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                        Nenhuma sugestão encontrada
                      </h3>
                      <p className="text-gray-600 dark:text-gray-300 max-w-sm mx-auto">
                        O documento está ótimo! Não foram identificadas oportunidades de melhoria neste momento.
                      </p>
                    </div>
                  ) : (
                    Object.entries(suggestionsByChapter).map(([chapter, chapterSuggestions]) => (
                      <div key={chapter} className="space-y-4">
                        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur py-3 border-b-2 border-red-200 dark:border-red-800">
                          <div className="flex items-center gap-2">
                            <div className="w-1 h-5 bg-red-500 rounded-full" />
                            <h3 className="text-base font-bold text-gray-900 dark:text-white">
                              {chapter}
                            </h3>
                            <Badge variant="secondary" className="ml-2 bg-red-100 dark:bg-red-900 text-red-900 dark:text-red-100">
                              {chapterSuggestions.length}
                            </Badge>
                          </div>
                        </div>
                        {chapterSuggestions.map((suggestion) => {
                          const isAccepted = acceptedSuggestions.has(suggestion.id);
                          const typeInfo = typeLabels[suggestion.type] || {
                            label: suggestion.type,
                            color: 'bg-gray-500'
                          };

                          return (
                            <div
                              key={suggestion.id}
                              className={`group relative p-5 border-2 rounded-xl transition-all duration-200 cursor-pointer hover:shadow-lg ${
                                isAccepted
                                  ? 'border-green-500 bg-gradient-to-br from-green-50 to-green-100/50 dark:from-green-950/50 dark:to-green-900/30'
                                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/50 hover:border-red-300 dark:hover:border-red-700'
                              } ${
                                hoveredSuggestionId === suggestion.id
                                  ? 'ring-4 ring-yellow-400/50 shadow-xl scale-[1.02]'
                                  : ''
                              }`}
                              onMouseEnter={() => setHoveredSuggestionId(suggestion.id)}
                              onMouseLeave={() => setHoveredSuggestionId(null)}
                              onClick={() => scrollToSuggestion(suggestion.id)}
                            >
                              {/* Status indicator */}
                              <div className="absolute -left-1 top-5 w-3 h-3 rounded-full">
                                {isAccepted ? (
                                  <div className="w-full h-full bg-green-500 rounded-full animate-pulse shadow-lg shadow-green-500/50" />
                                ) : (
                                  <div className="w-full h-full bg-gray-300 dark:bg-gray-600 rounded-full" />
                                )}
                              </div>

                              <div className="flex items-start justify-between mb-4">
                                <div className="flex gap-2">
                                  <Badge className={`${typeInfo.color} text-white shadow-sm`}>
                                    {typeInfo.label}
                                  </Badge>
                                  <Badge variant="outline" className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white border-gray-300 dark:border-gray-600">
                                    {Math.round(suggestion.confidence * 100)}% confiança
                                  </Badge>
                                </div>
                              </div>

                              <div className="space-y-4">
                                <div className="space-y-2">
                                  <div className="flex items-center gap-2">
                                    <div className="w-1 h-4 bg-red-400 rounded-full" />
                                    <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
                                      Original
                                    </p>
                                  </div>
                                  <p className="text-sm leading-relaxed text-gray-900 dark:text-white bg-red-50 dark:bg-red-950/20 p-3 rounded-lg border-l-4 border-red-400">
                                    {suggestion.originalText}
                                  </p>
                                </div>

                                <div className="space-y-2">
                                  <div className="flex items-center gap-2">
                                    <div className="w-1 h-4 bg-green-400 rounded-full" />
                                    <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
                                      Sugestão
                                    </p>
                                  </div>
                                  <p className="text-sm leading-relaxed text-gray-900 dark:text-white bg-green-50 dark:bg-green-950/20 p-3 rounded-lg border-l-4 border-green-400">
                                    {suggestion.improvedText}
                                  </p>
                                </div>

                                <div className="flex items-start gap-2 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
                                  <Info className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                                  <p className="text-xs text-gray-900 dark:text-white leading-relaxed">
                                    {suggestion.reason}
                                  </p>
                                </div>
                              </div>

                              <div className="flex gap-2 mt-5 pt-4 border-t border-gray-200 dark:border-gray-700">
                                {isAccepted ? (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleSuggestion(suggestion.id);
                                    }}
                                    className="flex-1 border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950/50 transition-all"
                                  >
                                    <XCircle className="mr-2 h-4 w-4" />
                                    Rejeitar
                                  </Button>
                                ) : (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleSuggestion(suggestion.id);
                                    }}
                                    className="flex-1 border-green-300 text-green-700 hover:bg-green-50 dark:border-green-700 dark:text-green-400 dark:hover:bg-green-950/50 transition-all"
                                  >
                                    <CheckCircle2 className="mr-2 h-4 w-4" />
                                    Aceitar
                                  </Button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* Right: Document Preview with Highlights */}
        <div className="sticky top-[280px]">
          <Card className="shadow-lg border-2">
            <CardHeader className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 border-b-2">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <CardTitle className="text-xl flex items-center gap-2 text-gray-900 dark:text-white">
                    <div className="w-1 h-6 bg-red-500 rounded-full" />
                    {documentTitle}
                  </CardTitle>
                  <CardDescription className="mt-2 text-sm">
                    Clique em uma sugestão para ver sua localização • Os destaques mudam de cor ao aceitar/rejeitar
                  </CardDescription>
                </div>
              </div>

              {/* Legend */}
              <div className="flex gap-4 mt-4 pt-3 border-t dark:border-gray-700">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-red-100 border-b-2 border-red-400 rounded" />
                  <span className="text-xs text-gray-700 dark:text-gray-300">Não aceita</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-green-100 border-b-2 border-green-400 rounded" />
                  <span className="text-xs text-gray-700 dark:text-gray-300">Aceita</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-yellow-200 border-2 border-yellow-400 rounded" />
                  <span className="text-xs text-gray-700 dark:text-gray-300">Selecionada</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[calc(100vh-380px)]">
                <div
                  className="prose prose-sm max-w-none p-6 whitespace-pre-wrap text-gray-900 dark:text-white leading-relaxed"
                  style={{ fontSize: '14px', lineHeight: '1.8' }}
                  dangerouslySetInnerHTML={{ __html: getHighlightedDocument() }}
                />
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
