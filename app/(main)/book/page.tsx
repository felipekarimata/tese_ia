'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, BookOpen, FileStack, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type Thesis = {
  id: string;
  title: string;
  description?: string;
  chapterCount: number;
};

export default function BookPage() {
  const [theses, setTheses] = useState<Thesis[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [schemaError, setSchemaError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadTheses() {
      try {
        const [thesesResponse, healthResponse] = await Promise.all([
          fetch('/api/theses', { cache: 'no-store' }),
          fetch('/api/book-assembly/health', { cache: 'no-store' }),
        ]);
        const [data, health] = await Promise.all([thesesResponse.json(), healthResponse.json()]);

        if (!thesesResponse.ok) {
          throw new Error(data.error || 'Não foi possível carregar as teses.');
        }

        if (!cancelled) {
          setTheses(data.theses || []);
          if (!healthResponse.ok) {
            setSchemaError(health.error || 'A estrutura de Montar Livro ainda não foi preparada.');
          }
        }
      } catch (loadError: any) {
        if (!cancelled) setError(loadError.message || 'Não foi possível carregar as teses.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadTheses();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3">
            <FileStack className="h-6 w-6 text-red-400" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white">Montar Livro</h1>
            <p className="mt-1 text-gray-400">
              Escolha uma tese para selecionar, ordenar e harmonizar seus capítulos em um único livro.
            </p>
          </div>
        </div>
      </div>

      {schemaError && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="py-5 text-sm text-amber-200">{schemaError}</CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex min-h-64 items-center justify-center text-gray-400">
          <Loader2 className="mr-3 h-5 w-5 animate-spin text-red-400" />
          Carregando suas teses...
        </div>
      ) : error ? (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="py-8 text-center text-red-300">{error}</CardContent>
        </Card>
      ) : theses.length === 0 ? (
        <Card className="border-white/10 bg-white/[0.03]">
          <CardContent className="flex flex-col items-center py-14 text-center">
            <BookOpen className="mb-4 h-10 w-10 text-gray-500" />
            <p className="font-medium text-gray-200">Nenhuma tese disponível</p>
            <p className="mt-2 max-w-md text-sm text-gray-500">
              Importe capítulos como uma tese para começar a montar o livro.
            </p>
            <Button asChild className="mt-6 bg-red-600 hover:bg-red-700">
              <Link href="/">Voltar ao Dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {theses.map((thesis) => {
            const canAssemble = thesis.chapterCount > 0 && !schemaError;

            return (
              <Card
                key={thesis.id}
                className="group flex h-full flex-col border-white/10 bg-gradient-to-br from-white/[0.07] to-white/[0.02] transition-all hover:-translate-y-0.5 hover:border-red-500/30 hover:shadow-xl hover:shadow-red-500/10"
              >
                <CardHeader className="flex-1">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-2.5">
                      <BookOpen className="h-5 w-5 text-red-400" />
                    </div>
                    <Badge variant="secondary" className="border-white/10 bg-white/10 text-gray-300">
                      {thesis.chapterCount} {thesis.chapterCount === 1 ? 'capítulo' : 'capítulos'}
                    </Badge>
                  </div>
                  <CardTitle className="line-clamp-2 text-lg text-white">{thesis.title}</CardTitle>
                  <CardDescription className="line-clamp-3 text-gray-400">
                    {thesis.description || 'Sem descrição'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {canAssemble ? (
                    <Button asChild className="w-full bg-red-600 hover:bg-red-700">
                      <Link href={`/theses/${thesis.id}/book`}>
                        Selecionar capítulos
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                  ) : schemaError ? (
                    <Button className="w-full" variant="secondary" disabled>
                      Preparação do banco pendente
                    </Button>
                  ) : (
                    <Button className="w-full" variant="secondary" disabled>
                      Adicione um capítulo primeiro
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
