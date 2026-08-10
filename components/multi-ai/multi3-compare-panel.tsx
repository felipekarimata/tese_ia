'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Trophy, CheckCircle2, RefreshCw, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Multi3Session } from '@/lib/multi-ai/types';

type AIProvider = 'openai' | 'gemini' | 'grok' | 'anthropic';

const PROVIDER_LABEL: Record<AIProvider, string> = {
  openai: 'OpenAI',
  gemini: 'Google Gemini',
  grok: 'xAI Grok',
  anthropic: 'Anthropic Claude',
};

const providerColors: Record<string, string> = {
  openai: 'bg-green-950/50 text-green-400 border-green-900',
  gemini: 'bg-blue-950/50 text-blue-400 border-blue-900',
  grok: 'bg-purple-950/50 text-purple-400 border-purple-900',
  anthropic: 'bg-orange-950/50 text-orange-300 border-orange-900',
};

type Multi3ComparePanelProps = {
  session: Multi3Session;
  chapterId?: string;
  documentId?: string;
  onClose: () => void;
  onAccepted: (session: Multi3Session) => void;
  onSessionUpdate: (session: Multi3Session) => void;
  modelsByProvider?: Partial<Record<AIProvider, string>>;
};

export function Multi3ComparePanel({
  session,
  chapterId,
  documentId,
  onClose,
  onAccepted,
  onSessionUpdate,
  modelsByProvider,
}: Multi3ComparePanelProps) {
  const [accepting, setAccepting] = useState(false);
  const [judging, setJudging] = useState(false);
  const [judgeProvider, setJudgeProvider] = useState<AIProvider>(session.judgeProvider);

  const basePath = chapterId
    ? `/api/chapters/${chapterId}/multi3/${session.id}`
    : `/api/documents/${documentId}/multi3/${session.id}`;

  const sourceCandidates = session.candidates.filter((candidate) => candidate.role !== 'judge-final');
  const finalCandidate = session.candidates.find((candidate) => candidate.role === 'judge-final');
  const isTextOnly = session.command === '/perguntar';
  const isAccepted = session.status === 'accepted';
  const activeCandidate = session.candidates.find(
    (candidate) => candidate.versionId && candidate.versionId === session.winnerVersionId
  );
  const activeLabel = activeCandidate?.role === 'judge-final'
    ? 'Redação final do juiz'
    : activeCandidate
      ? PROVIDER_LABEL[activeCandidate.provider]
      : session.winnerProvider
        ? PROVIDER_LABEL[session.winnerProvider]
        : undefined;
  const selectedJudgeModel =
    modelsByProvider?.[judgeProvider] ||
    session.candidates.find((candidate) => candidate.provider === judgeProvider)?.model ||
    (judgeProvider === session.judgeProvider ? session.judgeModel : undefined);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const handleAccept = async (provider?: AIProvider, versionId?: string) => {
    try {
      setAccepting(true);
      const res = await fetch(`${basePath}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, versionId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao aceitar');
      onAccepted(data.session);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setAccepting(false);
    }
  };

  const handleRejudge = async () => {
    let progressTimer: ReturnType<typeof setInterval> | undefined;
    try {
      setJudging(true);
      progressTimer = setInterval(async () => {
        try {
          const progressResponse = await fetch(basePath, { cache: 'no-store' });
          if (!progressResponse.ok) return;
          const progressData = await progressResponse.json();
          if (progressData.session) onSessionUpdate(progressData.session);
        } catch {
          // A chamada principal continua sendo a fonte do erro final.
        }
      }, 2000);
      const res = await fetch(`${basePath}/judge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ judgeProvider, judgeModel: selectedJudgeModel }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao refazer a redação final');
      onSessionUpdate(data.session);
    } catch (e: any) {
      alert(e.message);
    } finally {
      if (progressTimer) clearInterval(progressTimer);
      setJudging(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden overscroll-none bg-black/70 p-4 backdrop-blur-sm"
      onWheel={(event) => {
        event.stopPropagation();
        const target = event.target as HTMLElement;
        if (!target.closest('[data-radix-scroll-area-viewport]')) {
          event.preventDefault();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Comparação e redação final Multi-IA"
        className="flex h-[90dvh] min-h-0 w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gray-950 to-black shadow-2xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Comparação e redação final Multi-IA</h2>
            <p className="text-sm text-gray-400">
              {session.command}{session.commandArgs ? ` — ${session.commandArgs}` : ''}
              {isAccepted && !isTextOnly && (
                <span className="text-green-400">
                  {finalCandidate ? ' · redação final salva automaticamente' : ' · versão selecionada salva automaticamente'}
                </span>
              )}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        <ScrollArea className="min-h-0 flex-1 overscroll-contain [&_[data-radix-scroll-area-viewport]]:overscroll-contain">
          <div className="space-y-4 px-6 py-4">
            {session.judgeReasoning && (
              <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3">
                <div className="mb-1 flex items-center gap-2 text-sm font-medium text-yellow-400">
                  <Trophy className="h-4 w-4 shrink-0" />
                  <span>
                    {finalCandidate ? 'Redação final do juiz' : 'Recomendação do juiz'} ({PROVIDER_LABEL[session.judgeProvider]}
                    {session.judgeModel ? ` · ${session.judgeModel}` : ''})
                  </span>
                </div>
                <p className="text-sm text-gray-300">{session.judgeReasoning}</p>
                {session.judgeScores && Object.keys(session.judgeScores).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {Object.entries(session.judgeScores).map(([p, score]) => (
                      <Badge key={p} variant="outline" className="text-xs">
                        {p}: {score}/10
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            )}

            {finalCandidate && (
              <Card className={cn(
                'border-yellow-500/30 bg-yellow-500/[0.06]',
                finalCandidate.versionId === session.winnerVersionId && 'ring-2 ring-green-500/40'
              )}>
                <CardHeader className="pb-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="flex items-center gap-2 text-base text-yellow-300">
                      <Trophy className="h-4 w-4" />
                      Redação final do juiz
                    </CardTitle>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={providerColors[finalCandidate.provider] || ''} variant="outline">
                        {PROVIDER_LABEL[finalCandidate.provider]}
                      </Badge>
                      <Badge variant="outline">{finalCandidate.model}</Badge>
                    </div>
                  </div>
                  {finalCandidate.versionId === session.winnerVersionId && (
                    <Badge className="w-fit border border-green-500/30 bg-green-500/20 text-green-400">
                      Versão ativa
                    </Badge>
                  )}
                </CardHeader>
                <CardContent className="space-y-3">
                  {finalCandidate.status === 'running' && (
                    <div className="flex items-center gap-2 text-sm text-yellow-200">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {finalCandidate.progressLabel || 'Redigindo...'}
                      {typeof finalCandidate.progress === 'number' && ` ${finalCandidate.progress}%`}
                    </div>
                  )}
                  {finalCandidate.status === 'failed' && (
                    <p className="text-sm text-red-400">{finalCandidate.error || 'Falha na redação final'}</p>
                  )}
                  {finalCandidate.status === 'completed' && (
                    <>
                      <div className="prose prose-sm prose-invert max-w-none whitespace-pre-wrap text-sm text-gray-200">
                        {finalCandidate.text?.slice(0, 4000) || '(Sem preview de texto)'}
                        {(finalCandidate.text?.length ?? 0) > 4000 && '…'}
                      </div>
                      {!isTextOnly && finalCandidate.versionId && (chapterId || documentId) && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full border-yellow-500/30"
                          onClick={() => handleAccept(finalCandidate.provider, finalCandidate.versionId)}
                          disabled={accepting || finalCandidate.versionId === session.winnerVersionId}
                        >
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                          {finalCandidate.versionId === session.winnerVersionId
                            ? 'Redação final ativa'
                            : 'Usar redação final'}
                        </Button>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            )}

            <div className={cn(
              'grid items-start gap-4',
              sourceCandidates.length === 1 ? 'grid-cols-1' : sourceCandidates.length === 2 ? 'md:grid-cols-2' : 'md:grid-cols-3'
            )}>
              {sourceCandidates.map((candidate, index) => {
                const isActiveCandidate = candidate.versionId
                  ? candidate.versionId === session.winnerVersionId
                  : !session.winnerVersionId && candidate.provider === session.winnerProvider;
                return (
                  <Card
                    key={`${candidate.provider}-${candidate.branchIndex ?? index}`}
                    className={cn(
                      'flex flex-col border-white/10 bg-white/[0.03]',
                      isActiveCandidate && 'ring-2 ring-green-500/40'
                    )}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle className="text-base">{PROVIDER_LABEL[candidate.provider]}</CardTitle>
                        <Badge className={providerColors[candidate.provider] || ''} variant="outline">
                          {candidate.model}
                        </Badge>
                      </div>
                      {isActiveCandidate && (
                        <Badge className="w-fit border border-green-500/30 bg-green-500/20 text-green-400">
                          Versão ativa
                        </Badge>
                      )}
                    </CardHeader>
                    <CardContent className="flex-1 space-y-3">
                      {candidate.status === 'running' && (
                        <div className="flex items-center gap-2 text-sm text-gray-400">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          {candidate.progressLabel || 'Processando...'}
                          {typeof candidate.progress === 'number' && ` ${candidate.progress}%`}
                        </div>
                      )}
                      {candidate.status === 'failed' && (
                        <p className="text-sm text-red-400">{candidate.error || 'Falhou'}</p>
                      )}
                      {candidate.status === 'completed' && (
                        <>
                          <div className="prose prose-sm prose-invert max-w-none whitespace-pre-wrap text-sm text-gray-300">
                            {candidate.text?.slice(0, 3000) || '(Sem preview de texto)'}
                            {(candidate.text?.length ?? 0) > 3000 && '…'}
                          </div>
                          {candidate.versionIds && candidate.versionIds.length > 0 && (
                            <p className="text-xs text-gray-500">
                              {candidate.versionIds.length} versão(ões) no fluxo /todos
                            </p>
                          )}
                          {!isTextOnly && candidate.versionId && (chapterId || documentId) && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full"
                              onClick={() => handleAccept(candidate.provider, candidate.versionId)}
                              disabled={accepting || isActiveCandidate}
                            >
                              <CheckCircle2 className="mr-2 h-4 w-4" />
                              {isActiveCandidate ? 'Versão ativa' : `Usar ${PROVIDER_LABEL[candidate.provider]}`}
                            </Button>
                          )}
                        </>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </ScrollArea>

        <div className="flex shrink-0 flex-wrap items-center gap-3 border-t border-white/10 px-6 py-4">
          {!isTextOnly && (
            <p className="text-xs text-gray-500 w-full sm:w-auto">
              Todas as versões ficam no histórico Multi-IA. Compare aqui ou use <code className="text-gray-400">/comparar</code>.
            </p>
          )}
          {session.status === 'awaiting_human' && !isTextOnly && (
            <Button
              onClick={() => handleAccept()}
              disabled={accepting || (!session.winnerProvider && !session.winnerVersionId)}
              className="bg-yellow-600 hover:bg-yellow-700"
            >
              {accepting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trophy className="h-4 w-4 mr-2" />}
              Ativar versão indicada
            </Button>
          )}
          {isAccepted && !isTextOnly && activeLabel && (
            <Badge className="bg-green-500/15 text-green-400 border-green-500/30">
              Ativa: {activeLabel}
            </Badge>
          )}
          <div className="flex items-center gap-2 ml-auto">
            <Select value={judgeProvider} onValueChange={(v) => setJudgeProvider(v as AIProvider)} disabled={judging}>
              <SelectTrigger className="w-36 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(['gemini', 'openai', 'anthropic', 'grok'] as AIProvider[]).map((p) => (
                  <SelectItem key={p} value={p}>
                    {PROVIDER_LABEL[p]} — {modelsByProvider?.[p] || sourceCandidates.find((c) => c.provider === p)?.model || 'modelo padrão'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={handleRejudge} disabled={judging}>
              {judging ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Refazer redação final
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
