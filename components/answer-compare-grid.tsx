'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import ReactMarkdown from 'react-markdown';
import { Clock, DollarSign, Hash } from 'lucide-react';

type Citation = {
  page: number;
  span: string;
};

type AIResponse = {
  provider: string;
  model: string;
  text: string;
  citations: Citation[];
  latencyMs: number;
  tokensIn: number;
  tokensOut: number;
  costEstimatedUsd: number;
};

interface AnswerCompareGridProps {
  answers: AIResponse[];
}

const providerColors: Record<string, string> = {
  openai: 'bg-green-950/50 text-green-400 border-green-900',
  gemini: 'bg-blue-950/50 text-blue-400 border-blue-900',
  grok: 'bg-purple-950/50 text-purple-400 border-purple-900',
  anthropic: 'bg-orange-950/50 text-orange-300 border-orange-900'
};

export function AnswerCompareGrid({ answers }: AnswerCompareGridProps) {
  if (answers.length === 0) return null;

  return (
    <div className={`grid gap-4 ${answers.length === 1 ? 'grid-cols-1' : answers.length === 2 ? 'md:grid-cols-2' : 'md:grid-cols-3'}`}>
      {answers.map((answer, idx) => (
        <Card key={idx} className="flex flex-col">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg capitalize">{answer.provider}</CardTitle>
              <Badge className={providerColors[answer.provider] || ''} variant="outline">
                {answer.model}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="flex-1 space-y-4">
            {/* Resposta */}
            <div className="prose prose-sm max-w-none">
              <ReactMarkdown>{answer.text}</ReactMarkdown>
            </div>

            {/* Citações */}
            {answer.citations.length > 0 && (
              <div className="border-t pt-3">
                <p className="text-xs font-semibold text-muted-foreground mb-2">Citações:</p>
                <div className="flex flex-wrap gap-2">
                  {answer.citations.map((citation, cidx) => (
                    <Badge key={cidx} variant="secondary" className="text-xs">
                      Pág. {citation.page}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Métricas */}
            <div className="border-t pt-3 space-y-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <Clock className="h-3 w-3" />
                <span>Latência: {answer.latencyMs}ms</span>
              </div>
              <div className="flex items-center gap-2">
                <Hash className="h-3 w-3" />
                <span>
                  Tokens: {answer.tokensIn} in / {answer.tokensOut} out
                </span>
              </div>
              <div className="flex items-center gap-2">
                <DollarSign className="h-3 w-3" />
                <span>Custo estimado: ${answer.costEstimatedUsd.toFixed(4)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
