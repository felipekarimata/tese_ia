'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  computeVersionDiff,
  type DiffRow,
  type DiffSegment
} from '@/lib/thesis/version-diff';

type VersionDiffProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chapterId: string;
  leftVersionId: string;
  leftVersionNumber: number;
  leftLabel?: string;
  rightVersionId: string;
  rightVersionNumber: number;
  rightLabel?: string;
};

type ApplicationSummary = {
  requestedSuggestions?: number;
  appliedSuggestions?: number;
  changedParagraphs?: number;
};

function readApplicationSummary(metadata: Record<string, unknown>): ApplicationSummary | null {
  const value = metadata.applicationSummary;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as ApplicationSummary;
}

function readAppliedSuggestionCount(metadata: Record<string, unknown>): number | null {
  const summary = readApplicationSummary(metadata);
  if (typeof summary?.appliedSuggestions === 'number') return summary.appliedSuggestions;

  for (const key of ['appliedFindingIds', 'appliedNormIds']) {
    const value = metadata[key];
    if (Array.isArray(value)) return value.length;
  }

  return null;
}

function paragraphLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function VersionDiff({
  open,
  onOpenChange,
  chapterId,
  leftVersionId,
  leftVersionNumber,
  leftLabel = 'Original',
  rightVersionId,
  rightVersionNumber,
  rightLabel = 'Modificado',
}: VersionDiffProps) {
  const [leftText, setLeftText] = useState('');
  const [rightText, setRightText] = useState('');
  const [rightMetadata, setRightMetadata] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeChangeIndex, setActiveChangeIndex] = useState(0);
  const changeRowRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const loadTexts = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    setError('');

    try {
      const [leftRes, rightRes] = await Promise.all([
        fetch(`/api/chapters/${chapterId}/versions/${leftVersionId}/text`),
        fetch(`/api/chapters/${chapterId}/versions/${rightVersionId}/text`),
      ]);

      if (!leftRes.ok || !rightRes.ok) throw new Error('Falha ao carregar conteúdo das versões');

      const [leftData, rightData] = await Promise.all([leftRes.json(), rightRes.json()]);
      setLeftText(leftData.text || '');
      setRightText(rightData.text || '');
      setRightMetadata(rightData.metadata ?? {});
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar versões');
    } finally {
      setLoading(false);
    }
  }, [open, chapterId, leftVersionId, rightVersionId]);

  useEffect(() => {
    loadTexts();
  }, [loadTexts]);

  const diff = useMemo(
    () => leftText && rightText ? computeVersionDiff(leftText, rightText) : null,
    [leftText, rightText]
  );
  const appliedSuggestionCount = readAppliedSuggestionCount(rightMetadata);

  useEffect(() => {
    setActiveChangeIndex(0);
    changeRowRefs.current = {};
  }, [open, leftVersionId, rightVersionId]);

  const goToChange = useCallback((nextIndex: number) => {
    if (!diff?.totalChangeRows) return;
    const normalizedIndex = (
      nextIndex + diff.totalChangeRows
    ) % diff.totalChangeRows;
    setActiveChangeIndex(normalizedIndex);
    requestAnimationFrame(() => {
      changeRowRefs.current[normalizedIndex]?.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    });
  }, [diff?.totalChangeRows]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl h-[90vh] flex flex-col bg-gray-950 border-white/10 p-0 overflow-hidden gap-0">
        <DialogHeader className="px-6 py-4 border-b border-white/10 flex-shrink-0">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <DialogTitle className="flex items-center gap-2 text-white">
              <ArrowLeftRight className="h-5 w-5 text-red-400" />
              Comparação de Versões
            </DialogTitle>

            {diff && (
              <div className="flex flex-wrap items-center gap-2 pr-6 text-xs">
                {appliedSuggestionCount !== null && (
                  <Badge className="bg-blue-500/15 text-blue-300 border-blue-500/30">
                    {paragraphLabel(appliedSuggestionCount, 'sugestão aplicada', 'sugestões aplicadas')}
                  </Badge>
                )}
                {diff.changedParagraphs > 0 && (
                  <Badge className="bg-amber-500/15 text-amber-300 border-amber-500/30">
                    {paragraphLabel(diff.changedParagraphs, 'parágrafo alterado', 'parágrafos alterados')}
                  </Badge>
                )}
                {diff.removedParagraphs > 0 && (
                  <Badge className="bg-red-500/15 text-red-300 border-red-500/30">
                    -{paragraphLabel(diff.removedParagraphs, 'parágrafo removido', 'parágrafos removidos')}
                  </Badge>
                )}
                {diff.insertedParagraphs > 0 && (
                  <Badge className="bg-green-500/15 text-green-300 border-green-500/30">
                    +{paragraphLabel(diff.insertedParagraphs, 'parágrafo inserido', 'parágrafos inseridos')}
                  </Badge>
                )}

                {diff.totalChangeRows > 0 && (
                  <div className="ml-1 flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.03] p-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-gray-300 hover:bg-white/10 hover:text-white"
                      onClick={() => goToChange(activeChangeIndex - 1)}
                      aria-label="Ir para a alteração anterior"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="min-w-[4.5rem] text-center text-gray-300">
                      {activeChangeIndex + 1} de {diff.totalChangeRows}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-gray-300 hover:bg-white/10 hover:text-white"
                      onClick={() => goToChange(activeChangeIndex + 1)}
                      aria-label="Ir para a próxima alteração"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogHeader>

        <div className="grid grid-cols-2 divide-x divide-white/10 flex-shrink-0">
          <div className="px-6 py-3 flex items-center gap-2 bg-white/[0.02]">
            <div className="w-2 h-2 rounded-full bg-gray-400" />
            <span className="text-sm font-medium text-gray-300">
              v{leftVersionNumber} — {leftLabel}
            </span>
          </div>
          <div className="px-6 py-3 flex items-center gap-2 bg-white/[0.02]">
            <div className="w-2 h-2 rounded-full bg-red-400" />
            <span className="text-sm font-medium text-gray-300">
              v{rightVersionNumber} — {rightLabel}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Loader2 className="h-8 w-8 text-red-500 animate-spin mx-auto mb-3" />
                <p className="text-gray-400 text-sm">Carregando conteúdo...</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <FileText className="h-10 w-10 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-400">{error}</p>
                <Button variant="outline" className="mt-4 border-white/20" onClick={loadTexts}>
                  Tentar novamente
                </Button>
              </div>
            </div>
          ) : diff ? (
            <ScrollArea className="h-full">
              <div className="font-mono text-sm leading-relaxed">
                {diff.rows.map((row, rowIndex) => {
                  const isActive = row.changeIndex === activeChangeIndex;
                  return (
                    <div
                      key={rowIndex}
                      ref={element => {
                        if (row.changeIndex !== undefined) {
                          changeRowRefs.current[row.changeIndex] = element;
                        }
                      }}
                      className={cn(
                        'grid grid-cols-2 divide-x divide-white/10 border-b border-white/[0.04] transition-colors',
                        isActive && 'bg-amber-400/[0.06] ring-1 ring-inset ring-amber-400/30'
                      )}
                    >
                      <DiffParagraph row={row} side="left" />
                      <DiffParagraph row={row} side="right" />
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DiffParagraph({ row, side }: { row: DiffRow; side: 'left' | 'right' }) {
  const text = side === 'left' ? row.leftText : row.rightText;
  const segments = side === 'left' ? row.leftSegments : row.rightSegments;
  const isRemoved = side === 'left' && (row.type === 'changed' || row.type === 'removed');
  const isAdded = side === 'right' && (row.type === 'changed' || row.type === 'added');

  return (
    <div
      className={cn(
        'min-h-[3.25rem] px-6 py-3 whitespace-pre-wrap break-words',
        row.type === 'equal' && 'text-gray-300',
        isRemoved && 'bg-red-500/[0.07] text-red-100',
        isAdded && 'bg-green-500/[0.07] text-green-100',
        !text && 'bg-white/[0.015] text-gray-600 italic'
      )}
    >
      {text ? (
        segments ? <InlineSegments segments={segments} side={side} /> : text
      ) : (
        <span className="opacity-60">Sem parágrafo correspondente</span>
      )}
    </div>
  );
}

function InlineSegments({ segments, side }: { segments: DiffSegment[]; side: 'left' | 'right' }) {
  return (
    <>
      {segments.map((segment, index) => (
        <span
          key={index}
          className={cn(
            segment.type === 'equal' && 'text-gray-300',
            side === 'left' && segment.type === 'removed'
              && 'rounded-sm bg-red-500/30 text-red-100 line-through decoration-red-300/70',
            side === 'right' && segment.type === 'added'
              && 'rounded-sm bg-green-500/30 text-green-50'
          )}
        >
          {segment.text}
        </span>
      ))}
    </>
  );
}
