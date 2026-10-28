'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, FileText, File, Trash2, Pencil, Check, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import Link from 'next/link';
import { cn } from '@/lib/utils';

type ChapterVersion = {
  id: string;
  versionNumber: number;
  pages: number | null;
  chunksCount: number | null;
  createdByOperation: string;
  createdAt: string;
  isCurrent: boolean;
};

type Chapter = {
  id: string;
  title: string;
  chapterOrder: number;
  currentVersion: ChapterVersion | null;
  totalVersions: number;
  versions?: ChapterVersion[];
};

type ThesisTreeProps = {
  chapters: Chapter[];
  onDeleteChapter?: (chapterId: string) => void;
  onChapterClick?: (chapterId: string) => void;
  onRenamed?: () => void;
};

export function ThesisTree({ chapters, onDeleteChapter, onChapterClick, onRenamed }: ThesisTreeProps) {
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [savingRename, setSavingRename] = useState(false);

  const startRename = (chapterId: string, currentTitle: string) => {
    setEditingId(chapterId);
    setEditValue(currentTitle);
  };

  const cancelRename = () => {
    setEditingId(null);
    setEditValue('');
  };

  const saveRename = async (chapterId: string, currentTitle: string) => {
    const next = editValue.trim();
    if (!next) {
      toast.error('O título não pode ficar vazio.');
      return;
    }
    if (next === currentTitle) {
      cancelRename();
      return;
    }
    try {
      setSavingRename(true);
      const res = await fetch(`/api/chapters/${chapterId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: next }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Falha ao renomear capítulo');
      }
      toast.success('Capítulo renomeado.');
      cancelRename();
      onRenamed?.();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao renomear');
    } finally {
      setSavingRename(false);
    }
  };

  const toggleChapter = (chapterId: string) => {
    const newExpanded = new Set(expandedChapters);
    if (newExpanded.has(chapterId)) {
      newExpanded.delete(chapterId);
    } else {
      newExpanded.add(chapterId);
    }
    setExpandedChapters(newExpanded);
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

  if (chapters.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>Nenhum capítulo nesta tese</p>
        <p className="text-sm mt-2">Adicione capítulos para começar</p>
      </div>
    );
  }

  // Sort chapters by order
  const sortedChapters = [...chapters].sort((a, b) => a.chapterOrder - b.chapterOrder);

  return (
    <div className="space-y-2">
      {sortedChapters.map((chapter) => {
        const isExpanded = expandedChapters.has(chapter.id);
        const hasVersions = (chapter.totalVersions || 0) > 0;

        return (
          <div key={chapter.id} className="border rounded-lg overflow-hidden">
            {/* Chapter Header */}
            <div className="flex items-center gap-2 p-3 bg-muted/50 hover:bg-muted/70 transition-colors">
              {/* Expand/Collapse Button */}
              <button
                onClick={() => toggleChapter(chapter.id)}
                className="p-1 hover:bg-background rounded"
                disabled={!hasVersions}
              >
                {hasVersions ? (
                  isExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )
                ) : (
                  <div className="w-4 h-4" />
                )}
              </button>

              {/* Chapter Icon */}
              <FileText className="h-5 w-5 text-primary" />

              {/* Chapter Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm whitespace-nowrap">
                    Capítulo {chapter.chapterOrder}
                  </span>
                  {editingId === chapter.id ? (
                    <div className="flex items-center gap-1 flex-1">
                      <Input
                        autoFocus
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { e.preventDefault(); saveRename(chapter.id, chapter.title); }
                          if (e.key === 'Escape') { e.preventDefault(); cancelRename(); }
                        }}
                        disabled={savingRename}
                        className="h-7 text-sm"
                      />
                      <button
                        onClick={() => saveRename(chapter.id, chapter.title)}
                        disabled={savingRename}
                        title="Salvar (Enter)"
                        className="p-1 rounded text-green-600 hover:bg-green-500/10 disabled:opacity-50"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button
                        onClick={cancelRename}
                        disabled={savingRename}
                        title="Cancelar (Esc)"
                        className="p-1 rounded text-muted-foreground hover:bg-muted disabled:opacity-50"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <span
                      className="text-sm text-muted-foreground truncate cursor-text"
                      onDoubleClick={() => startRename(chapter.id, chapter.title)}
                      title="Clique duas vezes para renomear"
                    >
                      {chapter.title}
                    </span>
                  )}
                </div>
                {chapter.currentVersion && (
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-xs">
                      v{chapter.currentVersion.versionNumber}
                    </Badge>
                    {chapter.currentVersion.pages && (
                      <span className="text-xs text-muted-foreground">
                        {chapter.currentVersion.pages} páginas
                      </span>
                    )}
                    <Badge
                      variant="secondary"
                      className={cn(
                        'text-xs text-white',
                        getOperationColor(chapter.currentVersion.createdByOperation)
                      )}
                    >
                      {getOperationLabel(chapter.currentVersion.createdByOperation)}
                    </Badge>
                  </div>
                )}
              </div>

              {/* Version Count */}
              <Badge variant="secondary" className="ml-auto">
                {chapter.totalVersions} {chapter.totalVersions === 1 ? 'versão' : 'versões'}
              </Badge>

              {/* Actions */}
              <div className="flex gap-1">
                {editingId !== chapter.id && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8"
                    title="Renomear capítulo"
                    aria-label="Renomear capítulo"
                    onClick={(e) => {
                      e.stopPropagation();
                      startRename(chapter.id, chapter.title);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                )}
                <Link href={`/chapters/${chapter.id}`}>
                  <Button size="sm" variant="ghost" className="h-8">
                    Abrir
                  </Button>
                </Link>
                {onDeleteChapter && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 text-destructive hover:text-destructive"
                    title="Excluir capítulo"
                    aria-label="Excluir capítulo"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteChapter(chapter.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            {/* Versions List (when expanded) */}
            {isExpanded && chapter.versions && chapter.versions.length > 0 && (
              <div className="border-t bg-background">
                {chapter.versions.map((version) => (
                  <div
                    key={version.id}
                    className={cn(
                      'flex items-center gap-2 p-3 pl-12 hover:bg-muted/50 transition-colors',
                      version.isCurrent && 'bg-primary/5'
                    )}
                  >
                    <File className="h-4 w-4 text-muted-foreground" />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          Versão {version.versionNumber}
                        </span>
                        {version.isCurrent && (
                          <Badge variant="default" className="text-xs">
                            Atual
                          </Badge>
                        )}
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-xs',
                            getOperationColor(version.createdByOperation),
                            'text-white border-0'
                          )}
                        >
                          {getOperationLabel(version.createdByOperation)}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        {version.pages && <span>{version.pages} páginas</span>}
                        {version.chunksCount && <span>{version.chunksCount} chunks</span>}
                        <span>{new Date(version.createdAt).toLocaleDateString('pt-BR')}</span>
                      </div>
                    </div>

                    <Link href={`/chapters/${chapter.id}/versions/${version.id}`}>
                      <Button size="sm" variant="ghost" className="h-7 text-xs">
                        Ver
                      </Button>
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
