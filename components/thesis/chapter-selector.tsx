'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FileText, ChevronDown, ChevronRight } from 'lucide-react';

type ChapterVersion = {
  id: string;
  versionNumber: number;
  createdByOperation: string;
  isCurrent: boolean;
  pages: number | null;
};

type Chapter = {
  id: string;
  title: string;
  chapterOrder: number;
  versions: ChapterVersion[];
};

type ChapterSelectorProps = {
  chapters: Chapter[];
  selectedVersionIds: string[];
  onSelectionChange: (versionIds: string[]) => void;
  currentChapterId?: string;
};

export function ChapterSelector({
  chapters,
  selectedVersionIds,
  onSelectionChange,
  currentChapterId
}: ChapterSelectorProps) {
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set());

  // Auto-expand current chapter
  useEffect(() => {
    if (currentChapterId && !expandedChapters.has(currentChapterId)) {
      setExpandedChapters(new Set([...expandedChapters, currentChapterId]));
    }
  }, [currentChapterId]);

  const toggleChapter = (chapterId: string) => {
    const newExpanded = new Set(expandedChapters);
    if (newExpanded.has(chapterId)) {
      newExpanded.delete(chapterId);
    } else {
      newExpanded.add(chapterId);
    }
    setExpandedChapters(newExpanded);
  };

  const toggleVersion = (versionId: string) => {
    const newSelected = selectedVersionIds.includes(versionId)
      ? selectedVersionIds.filter(id => id !== versionId)
      : [...selectedVersionIds, versionId];
    onSelectionChange(newSelected);
  };

  const toggleAllVersions = (chapter: Chapter, checked: boolean) => {
    const versionIds = chapter.versions.map(v => v.id);
    if (checked) {
      // Adiciona todas as versões do capítulo
      const newSelected = [...new Set([...selectedVersionIds, ...versionIds])];
      onSelectionChange(newSelected);
    } else {
      // Remove todas as versões do capítulo
      const newSelected = selectedVersionIds.filter(id => !versionIds.includes(id));
      onSelectionChange(newSelected);
    }
  };

  const isChapterSelected = (chapter: Chapter) => {
    return chapter.versions.some(v => selectedVersionIds.includes(v.id));
  };

  const isChapterFullySelected = (chapter: Chapter) => {
    return chapter.versions.every(v => selectedVersionIds.includes(v.id));
  };

  const getOperationColor = (operation: string) => {
    switch (operation) {
      case 'upload': return 'bg-blue-500';
      case 'improve': return 'bg-green-500';
      case 'translate': return 'bg-purple-500';
      case 'adjust': return 'bg-orange-500';
      case 'adapt': return 'bg-pink-500';
      case 'update': return 'bg-yellow-500';
      default: return 'bg-gray-500';
    }
  };

  const getOperationLabel = (operation: string) => {
    switch (operation) {
      case 'upload': return 'Original';
      case 'improve': return 'Melhorado';
      case 'translate': return 'Traduzido';
      case 'adjust': return 'Ajustado';
      case 'adapt': return 'Adaptado';
      case 'update': return 'Atualizado';
      default: return operation;
    }
  };

  const sortedChapters = [...chapters].sort((a, b) => a.chapterOrder - b.chapterOrder);

  return (
    <Card className="bg-gradient-to-br from-white/[0.07] to-white/[0.02] backdrop-blur-xl border-white/10">
      <CardHeader>
        <CardTitle className="text-lg">Contexto do Chat</CardTitle>
        <CardDescription>
          Selecione quais capítulos incluir no contexto
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px] pr-4">
          <div className="space-y-2">
            {sortedChapters.map((chapter) => {
              const isExpanded = expandedChapters.has(chapter.id);
              const isSelected = isChapterSelected(chapter);
              const isFullySelected = isChapterFullySelected(chapter);

              return (
                <div key={chapter.id} className="border rounded-lg overflow-hidden">
                  {/* Chapter Header */}
                  <div className="flex items-center gap-2 p-3 bg-muted/30 hover:bg-muted/50 transition-colors">
                    <button
                      onClick={() => toggleChapter(chapter.id)}
                      className="p-1 hover:bg-background rounded flex-shrink-0"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>

                    <Checkbox
                      checked={isFullySelected}
                      onCheckedChange={(checked) => toggleAllVersions(chapter, checked as boolean)}
                      className="flex-shrink-0"
                    />

                    <FileText className="h-4 w-4 text-primary flex-shrink-0" />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          Cap {chapter.chapterOrder}
                        </span>
                        <span className="text-xs text-muted-foreground truncate">
                          {chapter.title}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {chapter.versions.length} {chapter.versions.length === 1 ? 'versão' : 'versões'}
                      </p>
                    </div>

                    {isSelected && (
                      <Badge variant="secondary" className="text-xs flex-shrink-0">
                        Incluído
                      </Badge>
                    )}
                  </div>

                  {/* Versions List */}
                  {isExpanded && (
                    <div className="border-t bg-background/50">
                      {chapter.versions.map((version) => (
                        <div
                          key={version.id}
                          className="flex items-center gap-2 p-2 pl-12 hover:bg-muted/30 transition-colors cursor-pointer"
                          onClick={() => toggleVersion(version.id)}
                        >
                          <Checkbox
                            checked={selectedVersionIds.includes(version.id)}
                            onCheckedChange={() => toggleVersion(version.id)}
                            onClick={(e) => e.stopPropagation()}
                          />

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium">v{version.versionNumber}</span>
                              {version.isCurrent && (
                                <Badge variant="default" className="text-[10px] px-1 py-0">
                                  Atual
                                </Badge>
                              )}
                              <Badge
                                variant="outline"
                                className={`text-[10px] px-1 py-0 ${getOperationColor(version.createdByOperation)} text-white border-0`}
                              >
                                {getOperationLabel(version.createdByOperation)}
                              </Badge>
                            </div>
                            {version.pages && (
                              <p className="text-[10px] text-muted-foreground">
                                {version.pages} {version.pages === 1 ? 'página' : 'páginas'}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>

        {selectedVersionIds.length > 0 && (
          <div className="mt-4 pt-4 border-t">
            <p className="text-sm text-muted-foreground">
              {selectedVersionIds.length} {selectedVersionIds.length === 1 ? 'versão selecionada' : 'versões selecionadas'}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
