'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2, Upload, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useState } from 'react';

/**
 * Thesis agent entry point: resolves the first chapter and forwards to its
 * agent page. If the thesis has no chapters yet, shows an upload prompt
 * that points to the classic thesis page (where the user can add the first
 * chapter).
 */
export default function ThesisAgentRedirect() {
  const params = useParams();
  const router = useRouter();
  const thesisId = params.id as string;

  const [state, setState] = useState<'loading' | 'empty' | 'error'>('loading');
  const [thesisTitle, setThesisTitle] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/theses/${thesisId}`);
        if (!res.ok) {
          if (res.status === 404) {
            toast.error('Tese não encontrada');
            router.replace('/');
            return;
          }
          throw new Error('Falha ao carregar tese');
        }
        const data = await res.json();
        if (cancelled) return;
        setThesisTitle(data.thesis?.title || '');
        const chapters: any[] = data.chapters || [];
        if (chapters.length === 0) {
          setState('empty');
          return;
        }
        const first = [...chapters].sort((a, b) => a.chapterOrder - b.chapterOrder)[0];
        router.replace(`/chapters/${first.id}/agent`);
      } catch (e: any) {
        toast.error(e.message || 'Erro ao abrir tese');
        setState('error');
      }
    })();
    return () => { cancelled = true; };
  }, [thesisId, router]);

  if (state === 'empty') {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center max-w-md mx-auto">
        <div className="p-5 bg-red-500/10 border border-red-500/20 rounded-2xl mb-6">
          <BookOpen className="h-12 w-12 text-red-400" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">{thesisTitle || 'Tese'}</h2>
        <p className="text-gray-400 mb-8">
          Esta tese ainda não tem capítulos. Adicione o primeiro capítulo para começar a trabalhar no Modo Agente.
        </p>
        <Button
          onClick={() => router.push(`/theses/${thesisId}`)}
          className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white"
        >
          <Upload className="mr-2 h-4 w-4" />
          Adicionar Capítulo
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-8 w-8 text-red-500 animate-spin" />
    </div>
  );
}
