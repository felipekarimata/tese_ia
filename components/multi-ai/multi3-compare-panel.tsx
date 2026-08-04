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

  const completed = session.candidates.filter((c) => c.status === 'completed');
  const isTextOnly = session.command === '/perguntar';
  const isAccepted = session.status === 'accepted';
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

  const handleAccept = async (provider?: AIProvider) => {
    try {
      setAccepting(true);
      const res = await fetch(`${basePath}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: provider || session.winnerProvider }),
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
    try {
      setJudging(true);
      const res = await fetch(`${basePath}/judge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ judgeProvider, judgeModel: selectedJudgeModel }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao re-juizar');
      onSessionUpdate(data.session);
    } catch (e: any) {
      alert(e.message);
    } finally {
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
        aria-label="Comparação Multi-IA"
        className="flex h-[90dvh] min-h-0 w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gray-950 to-black shadow-2xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Comparação Multi-IA</h2>
            <p className="text-sm text-gray-400">
              {session.command}{session.commandArgs ? ` — ${session.commandArgs}` : ''}
              {isAccepted && !isTextOnly && (
                <span className="text-green-400"> · melhor versão salva automaticamente</span>
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
                    Recomendação do juiz ({PROVIDER_LABEL[session.judgeProvider]}
                    {session.judgeModel ? ` · ${session.judgeModel}` : ''})
                    {session.winnerProvider && `: ${PROVIDER_LABEL[session.winnerProvider]}`}
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

            <div className={cn(
              'grid items-start gap-4',
              completed.length === 1 ? 'grid-cols-1' : completed.length === 2 ? 'md:grid-cols-2' : 'md:grid-cols-3'
            )}>
            {session.candidates.map((candidate) => (
              <Card
                key={candidate.provider}
                className={cn(
                  'flex flex-col border-white/10 bg-white/[0.03]',
                  candidate.provider === session.winnerProvider && 'ring-2 ring-yellow-500/50'
                )}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{PROVIDER_LABEL[candidate.provider]}</CardTitle>
                    <Badge className={providerColors[candidate.provider] || ''} variant="outline">
                      {candidate.model}
                    </Badge>
                  </div>
                  {candidate.provider === session.winnerProvider && (
                    <Badge className={cn(
                      'w-fit border',
                      isAccepted
                        ? 'bg-green-500/20 text-green-400 border-green-500/30'
                        : 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
                    )}>
                      {isAccepted ? 'Versão ativa' : 'Recomendado'}
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
                      {session.command === '/todos' && candidate.provider === 'grok' && (
                        <p className="text-xs text-amber-400/80">
                          Revisão jurídica deste ramo: Gemini/gemini-2.5-flash.
                        </p>
                      )}
                      {!isTextOnly && candidate.versionId && (chapterId || documentId) && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={() => handleAccept(candidate.provider)}
                          disabled={accepting || (isAccepted && candidate.provider === session.winnerProvider)}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-2" />
                          {isAccepted && candidate.provider === session.winnerProvider
                            ? 'Versão ativa'
                            : `Usar ${PROVIDER_LABEL[candidate.provider]}`}
                        </Button>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            ))}
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
              disabled={accepting || !session.winnerProvider}
              className="bg-yellow-600 hover:bg-yellow-700"
            >
              {accepting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trophy className="h-4 w-4 mr-2" />}
              Ativar recomendação
            </Button>
          )}
          {isAccepted && !isTextOnly && session.winnerProvider && (
            <Badge className="bg-green-500/15 text-green-400 border-green-500/30">
              Ativa: {PROVIDER_LABEL[session.winnerProvider]}
            </Badge>
          )}
          <div className="flex items-center gap-2 ml-auto">
            <Select value={judgeProvider} onValueChange={(v) => setJudgeProvider(v as AIProvider)}>
              <SelectTrigger className="w-36 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(['gemini', 'openai', 'anthropic', 'grok'] as AIProvider[]).map((p) => (
                  <SelectItem key={p} value={p}>
                    {PROVIDER_LABEL[p]} — {modelsByProvider?.[p] || session.candidates.find((c) => c.provider === p)?.model || 'modelo padrão'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={handleRejudge} disabled={judging}>
              {judging ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Re-juizar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
