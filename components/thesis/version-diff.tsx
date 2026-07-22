'use client';

import { useEffect, useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, FileText, ArrowLeftRight } from 'lucide-react';
import { cn } from '@/lib/utils';

type DiffLine =
  | { type: 'equal'; text: string }
  | { type: 'removed'; text: string }
  | { type: 'added'; text: string };

function computeDiff(oldText: string, newText: string): { left: DiffLine[]; right: DiffLine[] } {
  const oldParagraphs = oldText.split(/\n+/).filter((p) => p.trim().length > 0);
  const newParagraphs = newText.split(/\n+/).filter((p) => p.trim().length > 0);

  // LCS matrix
  const m = oldParagraphs.length;
  const n = newParagraphs.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldParagraphs[i - 1] === newParagraphs[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack
  const left: DiffLine[] = [];
  const right: DiffLine[] = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldParagraphs[i - 1] === newParagraphs[j - 1]) {
      left.unshift({ type: 'equal', text: oldParagraphs[i - 1] });
      right.unshift({ type: 'equal', text: newParagraphs[j - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      left.unshift({ type: 'equal', text: '' }); // padding
      right.unshift({ type: 'added', text: newParagraphs[j - 1] });
      j--;
    } else {
      left.unshift({ type: 'removed', text: oldParagraphs[i - 1] });
      right.unshift({ type: 'equal', text: '' }); // padding
      i--;
    }
  }

  return { left, right };
}

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar versões');
    } finally {
      setLoading(false);
    }
  }, [open, chapterId, leftVersionId, rightVersionId]);

  useEffect(() => {
    loadTexts();
  }, [loadTexts]);

  const diff = leftText && rightText ? computeDiff(leftText, rightText) : null;

  const addedCount = diff?.right.filter((l) => l.type === 'added').length ?? 0;
  const removedCount = diff?.left.filter((l) => l.type === 'removed').length ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl h-[90vh] flex flex-col bg-gray-950 border-white/10 p-0 overflow-hidden gap-0">
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b border-white/10 flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-white">
              <ArrowLeftRight className="h-5 w-5 text-red-400" />
              Comparação de Versões
            </DialogTitle>
            {diff && (
              <div className="flex items-center gap-2 text-xs">
                {removedCount > 0 && (
                  <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
                    -{removedCount} parágrafos
                  </Badge>
                )}
                {addedCount > 0 && (
                  <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                    +{addedCount} parágrafos
                  </Badge>
                )}
              </div>
            )}
          </div>
        </DialogHeader>

        {/* Column headers */}
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

        {/* Content */}
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
            <div className="grid grid-cols-2 divide-x divide-white/10 h-full overflow-hidden">
              {/* Left column */}
              <ScrollArea className="h-full">
                <div className="p-6 space-y-2 font-mono text-sm leading-relaxed">
                  {diff.left.map((line, idx) => (
                    <DiffParagraph key={idx} line={line} side="left" />
                  ))}
                </div>
              </ScrollArea>

              {/* Right column */}
              <ScrollArea className="h-full">
                <div className="p-6 space-y-2 font-mono text-sm leading-relaxed">
                  {diff.right.map((line, idx) => (
                    <DiffParagraph key={idx} line={line} side="right" />
                  ))}
                </div>
              </ScrollArea>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DiffParagraph({ line, side }: { line: DiffLine; side: 'left' | 'right' }) {
  if (line.type === 'equal' && !line.text) {
    // Padding line
    return <div className="h-[1.5em] opacity-0 select-none" aria-hidden>·</div>;
  }

  return (
    <p
      className={cn(
        'px-3 py-2 rounded-md transition-colors whitespace-pre-wrap break-words',
        line.type === 'equal' && 'text-gray-300',
        line.type === 'removed' && 'bg-red-500/10 text-red-200 border-l-2 border-red-500',
        line.type === 'added' && 'bg-green-500/10 text-green-200 border-l-2 border-green-500',
        !line.text && 'text-gray-600 italic'
      )}
    >
      {line.text || <span className="opacity-40">&#xA0;</span>}
    </p>
  );
}
