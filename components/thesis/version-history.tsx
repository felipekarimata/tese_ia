'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  GitBranch, CheckCircle2, Circle, ArrowLeftRight, Eye, Clock, Trash2,
  Cpu, ChevronDown, ChevronRight, Trophy, MessageSquare, ExternalLink,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { VersionDiff } from './version-diff';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { Multi3Session, Multi3Candidate } from '@/lib/multi-ai/types';

type ChapterVersion = {
  id: string;
  versionNumber: number;
  createdByOperation: string;
  createdAt: string;
  isCurrent: boolean;
  parentVersionId: string | null;
  pages: number | null;
  metadata?: Record<string, unknown>;
};

type VersionHistoryProps = {
  versions: ChapterVersion[];
  chapterId: string;
  showHeader?: boolean;
  multi3Sessions?: Multi3Session[];
  onVersionDeleted?: (versionId: string) => void;
  onOpenMulti3Session?: (session: Multi3Session) => void;
  onReprocessMulti3Session?: (session: Multi3Session) => void;
};

const PROVIDER_LABEL: Record<string, string> = {
  openai: 'OpenAI',
  gemini: 'Google Gemini',
  grok: 'xAI Grok',
  anthropic: 'Anthropic Claude',
};

const OPERATION_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  upload:   { label: 'Original',  color: 'text-blue-400',   bg: 'bg-blue-500/15 border-blue-500/30' },
  improve:  { label: 'Melhorado', color: 'text-green-400',  bg: 'bg-green-500/15 border-green-500/30' },
  translate:{ label: 'Traduzido', color: 'text-purple-400', bg: 'bg-purple-500/15 border-purple-500/30' },
  adjust:   { label: 'Ajustado',  color: 'text-orange-400', bg: 'bg-orange-500/15 border-orange-500/30' },
  adapt:    { label: 'Adaptado',  color: 'text-pink-400',   bg: 'bg-pink-500/15 border-pink-500/30' },
  update:   { label: 'Atualizado',color: 'text-yellow-400', bg: 'bg-yellow-500/15 border-yellow-500/30' },
};

function getOpConfig(operation: string) {
  return OPERATION_CONFIG[operation] ?? { label: operation, color: 'text-gray-400', bg: 'bg-gray-500/15 border-gray-500/30' };
}

function versionsForBranch(
  versions: ChapterVersion[],
  sessionId: string,
  branchIndex: number
): ChapterVersion[] {
  return versions
    .filter((v) => {
      const m = v.metadata as Record<string, unknown> | undefined;
      return m?.multi3SessionId === sessionId && (m?.multi3BranchIndex ?? 0) === branchIndex;
    })
    .sort((a, b) => a.versionNumber - b.versionNumber);
}

export function VersionHistory({
  versions,
  chapterId,
  showHeader = true,
  multi3Sessions = [],
  onVersionDeleted,
  onOpenMulti3Session,
  onReprocessMulti3Session,
}: VersionHistoryProps) {
  const router = useRouter();
  const [diffOpen, setDiffOpen] = useState(false);
  const [diffLeft, setDiffLeft] = useState<ChapterVersion | null>(null);
  const [diffRight, setDiffRight] = useState<ChapterVersion | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [expandedTexts, setExpandedTexts] = useState<Set<string>>(new Set());

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleText = (key: string) => {
    setExpandedTexts((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleDeleteVersion = async (version: ChapterVersion) => {
    if (!confirm(`Excluir versão v${version.versionNumber} (${version.createdByOperation})? Esta ação não pode ser desfeita.`)) return;
    try {
      setDeletingId(version.id);
      const res = await fetch(`/api/chapters/${chapterId}/versions/${version.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Falha ao excluir versão');
      }
      toast.success(`Versão v${version.versionNumber} excluída.`);
      onVersionDeleted?.(version.id);
    } catch (e: any) {
      toast.error(e.message || 'Erro ao excluir versão');
    } finally {
      setDeletingId(null);
    }
  };

  const sorted = [...versions].sort((a, b) => a.versionNumber - b.versionNumber);
  const originalVersion = sorted[0];
  const currentVersion = sorted.find((v) => v.isCurrent) ?? sorted[sorted.length - 1];

  const multi3SessionIds = new Set(multi3Sessions.map((s) => s.id));
  const singles = sorted.filter((v) => {
    const sid = (v.metadata as Record<string, unknown> | undefined)?.multi3SessionId as string | undefined;
    return !sid || !multi3SessionIds.has(sid);
  });

  type TimelineEntry =
    | { type: 'single'; version: ChapterVersion; at: number }
    | { type: 'multi3'; session: Multi3Session; at: number };

  const timeline: TimelineEntry[] = [
    ...singles.map((v) => ({ type: 'single' as const, version: v, at: new Date(v.createdAt).getTime() })),
    ...multi3Sessions.map((s) => ({
      type: 'multi3' as const,
      session: s,
      at: new Date(s.createdAt).getTime(),
    })),
  ].sort((a, b) => a.at - b.at);

  if (timeline.length === 0) {
    return (
      <Card className="bg-gradient-to-br from-white/[0.07] to-white/[0.02] backdrop-blur-xl border-white/10">
        {showHeader && (
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <GitBranch className="h-5 w-5" />
              Histórico de Versões
            </CardTitle>
          </CardHeader>
        )}
        <CardContent className="flex flex-col items-center justify-center py-12">
          <GitBranch className="h-12 w-12 text-gray-600 mb-4" />
          <p className="text-sm text-gray-500">Nenhuma versão encontrada</p>
        </CardContent>
      </Card>
    );
  }

  const openDiff = (left: ChapterVersion, right: ChapterVersion) => {
    setDiffLeft(left);
    setDiffRight(right);
    setDiffOpen(true);
  };

  const renderVersionRow = (
    version: ChapterVersion,
    idx: number,
    sortedList: ChapterVersion[],
    opts?: { isChosen?: boolean; hideProvider?: boolean }
  ) => {
    const cfg = getOpConfig(version.createdByOperation);
    const isFirst = version.id === sorted[0]?.id;
    const prevVersion = idx > 0 ? sortedList[idx - 1] : null;
    const meta = version.metadata as Record<string, unknown> | undefined;
    const provider = meta?.multi3Provider as string | undefined;
    const isChosen = opts?.isChosen ?? meta?.multi3Role === 'winner';

    return (
      <div key={version.id} className="relative flex items-start gap-4 py-2.5">
        <div className="relative z-10 flex-shrink-0 mt-0.5">
          {version.isCurrent ? (
            <CheckCircle2 className="h-[22px] w-[22px] text-red-500" />
          ) : (
            <Circle className="h-[22px] w-[22px] text-gray-600" />
          )}
        </div>
        <div
          className={cn(
            'flex-1 flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border transition-all cursor-pointer group',
            isChosen
              ? 'bg-green-500/[0.08] border-green-500/30 hover:border-green-500/45'
              : version.isCurrent
                ? 'bg-red-500/[0.08] border-red-500/25 hover:border-red-500/40'
                : 'bg-white/[0.03] border-white/8 hover:bg-white/[0.06] hover:border-white/15'
          )}
          onClick={() => router.push(`/chapters/${chapterId}/versions/${version.id}`)}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-white">v{version.versionNumber}</span>
                {version.isCurrent && (
                  <Badge className="bg-red-600 text-white text-xs px-1.5 py-0 h-4">Atual</Badge>
                )}
                {isChosen && (
                  <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs px-1.5 py-0 h-4">
                    <Trophy className="h-3 w-3 mr-1 inline" />
                    Escolhida
                  </Badge>
                )}
                {isFirst && !version.isCurrent && (
                  <Badge variant="outline" className="text-gray-500 border-gray-700 text-xs px-1.5 py-0 h-4">Original</Badge>
                )}
                <Badge className={cn('text-xs border px-1.5 py-0 h-4', cfg.bg, cfg.color)}>{cfg.label}</Badge>
                {!opts?.hideProvider && provider && (
                  <Badge variant="outline" className="text-indigo-400 border-indigo-500/30 text-xs px-1.5 py-0 h-4 capitalize">
                    {PROVIDER_LABEL[provider] || provider}
                  </Badge>
                )}
                {meta?.multi3Step && (
                  <Badge variant="outline" className="text-gray-500 text-xs px-1.5 py-0 h-4">
                    {String(meta.multi3Step)}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <Clock className="h-3 w-3" />
                {new Date(version.createdAt).toLocaleDateString('pt-BR', {
                  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
                })}
                {version.pages && (<><span>·</span><span>{version.pages} {version.pages === 1 ? 'pág' : 'págs'}</span></>)}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            {prevVersion && (
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-gray-400 hover:text-white hover:bg-white/10 gap-1"
                onClick={() => openDiff(prevVersion, version)}>
                <ArrowLeftRight className="h-3 w-3" />Diff
              </Button>
            )}
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-gray-400 hover:text-white hover:bg-white/10"
              onClick={() => router.push(`/chapters/${chapterId}/versions/${version.id}`)}>
              <Eye className="h-3 w-3" />
            </Button>
            {version.createdByOperation !== 'upload' || versions.length === 1 ? (
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-gray-500 hover:text-red-400 hover:bg-red-500/10"
                disabled={deletingId === version.id}
                onClick={() => handleDeleteVersion(version)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    );
  };

  const renderCandidateText = (session: Multi3Session, candidate: Multi3Candidate) => {
    const isChosen = candidate.provider === session.winnerProvider;
    const textKey = `${session.id}-${candidate.provider}`;
    const expanded = expandedTexts.has(textKey);
    const displayText =
      candidate.text ||
      (candidate.status === 'failed' ? candidate.error || 'Processamento falhou' : '(sem resposta)');

    return (
      <div
        key={textKey}
        className={cn(
          'rounded-lg border px-3 py-2.5',
          isChosen
            ? 'bg-green-500/[0.08] border-green-500/30'
            : 'bg-white/[0.03] border-white/8'
        )}
      >
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <Badge variant="outline" className="text-indigo-400 border-indigo-500/30 text-xs capitalize">
            {PROVIDER_LABEL[candidate.provider] || candidate.provider}
          </Badge>
          {isChosen && (
            <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">
              <Trophy className="h-3 w-3 mr-1 inline" />
              Escolhida pelo juiz
            </Badge>
          )}
          {candidate.status === 'failed' && (
            <Badge className="bg-red-500/20 text-red-400 text-xs">Falhou</Badge>
          )}
        </div>
        <p className={cn('text-sm whitespace-pre-wrap', candidate.status === 'failed' ? 'text-red-400' : 'text-gray-300', !expanded && 'line-clamp-6')}>
          {displayText}
        </p>
        {displayText.length > 200 && (
          <button
            type="button"
            className="text-xs text-indigo-400 hover:text-indigo-300 mt-1"
            onClick={() => toggleText(textKey)}
          >
            {expanded ? 'Ver menos' : 'Ver resposta completa'}
          </button>
        )}
      </div>
    );
  };

  const renderMulti3Session = (session: Multi3Session) => {
    const groupKey = session.id;
    const isCollapsed = collapsedGroups.has(groupKey);
    const completed = session.candidates.filter((c) => c.status === 'completed');
    const isPerguntar = session.command === '/perguntar';
    const candidateCount = session.candidates.filter((c) => c.status !== 'failed').length;
    const isStuck = ['running', 'processing'].includes(session.status) && completed.length === 0;
    const winnerLabel = session.winnerProvider
      ? PROVIDER_LABEL[session.winnerProvider] || session.winnerProvider
      : null;

    return (
      <div key={groupKey} className="rounded-lg border border-indigo-500/25 bg-indigo-500/[0.05] p-2 my-2">
        <button
          type="button"
          className="flex items-center gap-2 w-full px-2 py-1.5 text-left text-sm text-indigo-300 hover:text-indigo-200"
          onClick={() => toggleGroup(groupKey)}
        >
          {isCollapsed ? <ChevronRight className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
          {isPerguntar ? <MessageSquare className="h-4 w-4 shrink-0" /> : <Cpu className="h-4 w-4 shrink-0" />}
          <span className="font-medium min-w-0 truncate">
            Multi-IA {session.command}
            {session.commandArgs ? ` — ${session.commandArgs}` : ''}
          </span>
          {winnerLabel && (
            <Badge className="bg-green-500/15 text-green-400 border-green-500/30 text-xs shrink-0">
              Escolhida: {winnerLabel}
            </Badge>
          )}
          <Badge variant="outline" className="text-xs border-indigo-500/30 text-indigo-400 shrink-0 ml-auto">
            {candidateCount} {isPerguntar ? 'respostas' : 'IAs'}
          </Badge>
        </button>

        {!isCollapsed && (
          <div className="px-2 pb-2 space-y-3 mt-1">
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
              <Clock className="h-3 w-3" />
              {new Date(session.createdAt).toLocaleDateString('pt-BR', {
                day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
              })}
              {session.judgeProvider && (
                <span>· Juiz: {PROVIDER_LABEL[session.judgeProvider] || session.judgeProvider}</span>
              )}
            </div>

            {session.judgeReasoning && (
              <p className="text-xs text-gray-400 bg-yellow-500/[0.06] border border-yellow-500/20 rounded-md px-3 py-2">
                {session.judgeReasoning}
              </p>
            )}

            {session.candidates.map((candidate) => {
              const branchIdx = candidate.branchIndex ?? 0;
              const branchVersions = versionsForBranch(sorted, session.id, branchIdx);
              const isChosenBranch = candidate.provider === session.winnerProvider;

              if (isPerguntar || branchVersions.length === 0) {
                return renderCandidateText(session, candidate);
              }

              return (
                <div key={candidate.provider} className="border-l-2 border-indigo-500/25 pl-3 space-y-1">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-xs text-indigo-400/90 font-medium capitalize">
                      {PROVIDER_LABEL[candidate.provider] || candidate.provider}
                    </p>
                    {isChosenBranch && (
                      <Badge className="bg-green-500/15 text-green-400 border-green-500/30 text-[10px] h-4">
                        Escolhida
                      </Badge>
                    )}
                  </div>
                  {branchVersions.map((v, i, list) => {
                    const idx = sorted.findIndex((x) => x.id === v.id);
                    const isFinalChosen =
                      isChosenBranch &&
                      (v.id === session.winnerVersionId || v.id === candidate.versionId);
                    return renderVersionRow(v, idx >= 0 ? idx : i, list, {
                      isChosen: isFinalChosen,
                      hideProvider: true,
                    });
                  })}
                </div>
              );
            })}

            {onOpenMulti3Session && completed.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="w-full text-xs border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/10"
                onClick={() => onOpenMulti3Session(session)}
              >
                <ExternalLink className="h-3.5 w-3.5 mr-2" />
                Abrir comparação completa
              </Button>
            )}

            {isStuck && onReprocessMulti3Session && (
              <Button
                size="sm"
                variant="outline"
                className="w-full text-xs border-amber-500/30 text-amber-300 hover:bg-amber-500/10"
                onClick={() => onReprocessMulti3Session(session)}
              >
                Reprocessar Multi-IA
              </Button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <Card className="bg-gradient-to-br from-white/[0.07] to-white/[0.02] backdrop-blur-xl border-white/10">
        {showHeader && (
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <GitBranch className="h-5 w-5 text-red-400" />
                Histórico de Versões
                <Badge variant="secondary" className="bg-white/10 text-gray-400 text-xs ml-1">
                  {versions.length}
                </Badge>
                {multi3Sessions.length > 0 && (
                  <Badge variant="secondary" className="bg-indigo-500/15 text-indigo-400 text-xs">
                    {multi3Sessions.length} Multi-IA
                  </Badge>
                )}
              </CardTitle>
              {versions.length >= 2 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-white/15 text-gray-300 hover:bg-white/10 gap-2 text-xs h-8"
                  onClick={() => openDiff(originalVersion, currentVersion)}
                >
                  <ArrowLeftRight className="h-3.5 w-3.5" />
                  Original vs Atual
                </Button>
              )}
            </div>
          </CardHeader>
        )}

        <CardContent className="pt-0">
          <div className="relative">
            {timeline.length > 1 && (
              <div className="absolute left-[19px] top-5 bottom-5 w-px bg-white/10" />
            )}
            <div className="space-y-1">
              {timeline.map((entry) => {
                if (entry.type === 'single') {
                  const idx = sorted.findIndex((v) => v.id === entry.version.id);
                  return renderVersionRow(entry.version, idx >= 0 ? idx : 0, sorted);
                }
                return renderMulti3Session(entry.session);
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {diffLeft && diffRight && (
        <VersionDiff
          open={diffOpen}
          onOpenChange={setDiffOpen}
          chapterId={chapterId}
          leftVersionId={diffLeft.id}
          leftVersionNumber={diffLeft.versionNumber}
          leftLabel={diffLeft.createdByOperation === 'upload' ? 'Original' : getOpConfig(diffLeft.createdByOperation).label}
          rightVersionId={diffRight.id}
          rightVersionNumber={diffRight.versionNumber}
          rightLabel={diffRight.isCurrent ? 'Atual' : getOpConfig(diffRight.createdByOperation).label}
        />
      )}
    </>
  );
}
