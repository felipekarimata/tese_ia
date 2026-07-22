'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BookOpen, Layers } from 'lucide-react';
import type { OperationContextSummary } from '@/lib/thesis/types';

type OperationContextDisplayProps = {
  contextChapters?: OperationContextSummary[];
};

export function OperationContextDisplay({ contextChapters }: OperationContextDisplayProps) {
  if (!contextChapters || contextChapters.length === 0) {
    return null;
  }

  // Sort chapters by order
  const sortedChapters = [...contextChapters].sort((a, b) => a.chapter_order - b.chapter_order);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <BookOpen className="h-5 w-5" />
          Contexto Utilizado
        </CardTitle>
        <CardDescription>
          Esta operação considerou o conteúdo dos seguintes capítulos como contexto
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {sortedChapters.map((chapter) => (
            <div
              key={chapter.version_id}
              className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
            >
              <div className="flex items-center gap-3">
                <Layers className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">
                    Capítulo {chapter.chapter_order}: {chapter.chapter_title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Versão {chapter.version_number}
                  </p>
                </div>
              </div>
              <Badge variant="outline" className="ml-2">
                v{chapter.version_number}
              </Badge>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          {sortedChapters.length === 1
            ? '1 capítulo usado como contexto'
            : `${sortedChapters.length} capítulos usados como contexto`}
        </p>
      </CardContent>
    </Card>
  );
}
