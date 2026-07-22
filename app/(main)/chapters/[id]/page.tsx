'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, BookOpen, FileText, Clock, Layers, Bot, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import { ChapterChat } from '@/components/thesis/chapter-chat';
import { VersionHistory } from '@/components/thesis/version-history';
type ChapterVersion = {
  id: string;
  versionNumber: number;
  filePath: string;
  pages: number | null;
  chunksCount: number | null;
  createdByOperation: string;
  metadata: any;
  createdAt: string;
  isCurrent: boolean;
  parentVersionId: string | null;
};

type Chapter = {
  id: string;
  thesisId: string;
  title: string;
  chapterOrder: number;
  createdAt: string;
  updatedAt: string;
  currentVersion: ChapterVersion | null;
  totalVersions: number;
  thesisTitle?: string;
};

export default function ChapterPage() {
  const params = useParams();
  const router = useRouter();
  const chapterId = params.id as string;

  // Redirect immediately to Agent Mode — that is the primary experience.
  useEffect(() => {
    router.replace(`/chapters/${chapterId}/agent`);
  }, [chapterId, router]);

  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [versions, setVersions] = useState<ChapterVersion[]>([]);
  const [allChapters, setAllChapters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadChapter = async () => {
    try {
      setLoading(true);

      // Load chapter details
      const chapterRes = await fetch(`/api/chapters/${chapterId}`);
      if (!chapterRes.ok) {
        if (chapterRes.status === 404) {
          toast.error('Capítulo não encontrado');
          router.push('/');
          return;
        }
        throw new Error('Falha ao carregar capítulo');
      }
      const chapterData = await chapterRes.json();
      setChapter(chapterData.chapter);

      // Load versions
      const versionsRes = await fetch(`/api/chapters/${chapterId}/versions`);
      if (versionsRes.ok) {
        const versionsData = await versionsRes.json();
        setVersions(versionsData.versions || []);
      }

      // Load all chapters from thesis for chat context
      if (chapterData.chapter.thesisId) {
        const thesisRes = await fetch(`/api/theses/${chapterData.chapter.thesisId}`);
        if (thesisRes.ok) {
          const thesisData = await thesisRes.json();
          const chaptersWithVersions = await Promise.all(
            (thesisData.chapters || []).map(async (ch: any) => {
              const vRes = await fetch(`/api/chapters/${ch.id}/versions`);
              if (vRes.ok) {
                const vData = await vRes.json();
                return {
                  id: ch.id,
                  title: ch.title,
                  chapterOrder: ch.chapterOrder,
                  versions: vData.versions || []
                };
              }
              return null;
            })
          );
          setAllChapters(chaptersWithVersions.filter(Boolean));
        }
      }

      console.log('[CHAPTER-PAGE] Loaded chapter:', chapterData.chapter.title);
      console.log('[CHAPTER-PAGE] Loaded versions:', versions.length);
    } catch (error: any) {
      console.error('[CHAPTER-PAGE] Error loading chapter:', error);
      toast.error(error.message || 'Erro ao carregar capítulo');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadChapter();
  }, [chapterId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-red-500/20 border-t-red-500 rounded-full animate-spin"></div>
        </div>
        <p className="text-gray-400 mt-6 text-sm">Carregando capítulo...</p>
      </div>
    );
  }

  if (!chapter) {
    return null;
  }

  const getOperationColor = (operation: string) => {
    switch (operation) {
      case 'upload':
        return 'bg-blue-500';
      case 'improve':
        return 'bg-green-500';
      case 'translate':
        return 'bg-purple-500';
      case 'adjust':
        return 'bg-orange-500';
      case 'adapt':
        return 'bg-pink-500';
      case 'update':
        return 'bg-yellow-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getOperationLabel = (operation: string) => {
    switch (operation) {
      case 'upload':
        return 'Upload';
      case 'improve':
        return 'Melhorado';
      case 'translate':
        return 'Traduzido';
      case 'adjust':
        return 'Ajustado';
      case 'adapt':
        return 'Adaptado';
      case 'update':
        return 'Atualizado';
      default:
        return operation;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(chapter.thesisId ? `/theses/${chapter.thesisId}` : '/')}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar para Tese
        </Button>

        <Link href={`/chapters/${chapterId}/agent`}>
          <Button
            size="sm"
            className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white shadow-lg shadow-red-500/20 gap-2"
          >
            <Bot className="h-4 w-4" />
            Abrir Modo Agente
            <Sparkles className="h-3 w-3" />
          </Button>
        </Link>
      </div>

      {/* Chapter Info */}
      <div className="space-y-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <FileText className="h-8 w-8 text-primary" />
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-3xl font-bold">{chapter.title}</h1>
                  <Badge variant="outline">Capítulo {chapter.chapterOrder}</Badge>
                </div>
                {chapter.thesisTitle && (
                  <p className="text-sm text-muted-foreground mt-1">
                    <BookOpen className="h-3 w-3 inline mr-1" />
                    {chapter.thesisTitle}
                  </p>
                )}
              </div>
            </div>

            {chapter.currentVersion && (
              <Card className="mt-4 bg-gradient-to-br from-white/[0.07] to-white/[0.02] backdrop-blur-xl border-white/10">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Layers className="h-5 w-5 text-primary" />
                    Versão Atual
                  </CardTitle>
                  <CardDescription>
                    Versão {chapter.currentVersion.versionNumber} - Criada em{' '}
                    {new Date(chapter.currentVersion.createdAt).toLocaleDateString('pt-BR', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge className={getOperationColor(chapter.currentVersion.createdByOperation)}>
                      {getOperationLabel(chapter.currentVersion.createdByOperation)}
                    </Badge>
                    {chapter.currentVersion.pages && (
                      <span className="text-sm text-muted-foreground">
                        {chapter.currentVersion.pages} {chapter.currentVersion.pages === 1 ? 'página' : 'páginas'}
                      </span>
                    )}
                    {chapter.currentVersion.chunksCount && (
                      <span className="text-sm text-muted-foreground">
                        • {chapter.currentVersion.chunksCount} chunks
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Version History - Visual Tree */}
        {versions.length > 0 && (
          <VersionHistory
            versions={versions}
            chapterId={chapterId}
          />
        )}

        {/* Chat Contextual */}
        {allChapters.length > 0 && (
          <ChapterChat
            currentChapterId={chapterId}
            allChapters={allChapters}
          />
        )}
      </div>
    </div>
  );
}
