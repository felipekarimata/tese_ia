'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ThesisTree } from '@/components/thesis/thesis-tree';
import { UploadChapterDialog } from '@/components/thesis/upload-chapter-dialog';
import { BookOpen, Upload, ArrowLeft, Trash2, FileText } from 'lucide-react';
import { toast } from 'sonner';

type Thesis = {
  id: string;
  title: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  chapterCount: number;
};

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
  versions?: ChapterVersion[];
};

export default function ThesisPage() {
  const params = useParams();
  const router = useRouter();
  const thesisId = params.id as string;

  const [thesis, setThesis] = useState<Thesis | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadThesis = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/theses/${thesisId}`);
      if (!res.ok) {
        if (res.status === 404) {
          toast.error('Tese não encontrada');
          router.push('/');
          return;
        }
        throw new Error('Falha ao carregar tese');
      }
      const data = await res.json();
      setThesis(data.thesis);
      setChapters(data.chapters || []);

      console.log('[THESIS-PAGE] Loaded thesis:', data.thesis.title);
      console.log('[THESIS-PAGE] Loaded chapters:', data.chapters?.length || 0);
    } catch (error: any) {
      console.error('[THESIS-PAGE] Error loading thesis:', error);
      toast.error(error.message || 'Erro ao carregar tese');
    } finally {
      setLoading(false);
    }
  };

  const loadChapterVersions = async (chapterId: string) => {
    try {
      const res = await fetch(`/api/chapters/${chapterId}/versions`);
      if (!res.ok) throw new Error('Falha ao carregar versões');

      const data = await res.json();

      // Update chapters with versions
      setChapters((prev) =>
        prev.map((ch) =>
          ch.id === chapterId
            ? { ...ch, versions: data.versions }
            : ch
        )
      );

      console.log(`[THESIS-PAGE] Loaded ${data.versions?.length || 0} versions for chapter ${chapterId}`);
    } catch (error: any) {
      console.error('[THESIS-PAGE] Error loading versions:', error);
    }
  };

  const handleDeleteChapter = async (chapterId: string) => {
    const chapter = chapters.find((c) => c.id === chapterId);
    if (!chapter) return;

    if (
      !confirm(
        `Tem certeza que deseja deletar o capítulo "${chapter.title}"? Todas as versões serão deletadas permanentemente.`
      )
    ) {
      return;
    }

    try {
      const res = await fetch(`/api/chapters/${chapterId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        throw new Error('Falha ao deletar capítulo');
      }

      toast.success('Capítulo deletado com sucesso');
      loadThesis();
    } catch (error: any) {
      console.error('[THESIS-PAGE] Error deleting chapter:', error);
      toast.error(error.message);
    }
  };

  const handleDeleteThesis = async () => {
    if (
      !confirm(
        'Tem certeza que deseja deletar esta tese? Todos os capítulos e versões serão deletados permanentemente.'
      )
    ) {
      return;
    }

    try {
      setDeleting(true);
      const res = await fetch(`/api/theses/${thesisId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        throw new Error('Falha ao deletar tese');
      }

      toast.success('Tese deletada com sucesso');
      router.push('/');
    } catch (error: any) {
      console.error('[THESIS-PAGE] Error deleting thesis:', error);
      toast.error(error.message);
      setDeleting(false);
    }
  };

  useEffect(() => {
    loadThesis();
  }, [thesisId]);

  // Load versions for all chapters when they're loaded
  useEffect(() => {
    chapters.forEach((chapter) => {
      if (!chapter.versions && chapter.totalVersions > 0) {
        loadChapterVersions(chapter.id);
      }
    });
  }, [chapters]);

  if (loading) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Carregando tese...</p>
      </div>
    );
  }

  if (!thesis) {
    return null;
  }

  const suggestedOrder = Math.max(0, ...chapters.map((c) => c.chapterOrder), 0) + 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.push('/')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
      </div>

      {/* Thesis Info */}
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <BookOpen className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold">{thesis.title}</h1>
          </div>
          {thesis.description && (
            <p className="text-muted-foreground mt-2 ml-11">{thesis.description}</p>
          )}
          <div className="flex items-center gap-4 mt-4 ml-11">
            <Badge variant="secondary">
              {thesis.chapterCount} {thesis.chapterCount === 1 ? 'capítulo' : 'capítulos'}
            </Badge>
            <span className="text-sm text-muted-foreground">
              Criada em {new Date(thesis.createdAt).toLocaleDateString('pt-BR')}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDeleteThesis}
            disabled={deleting}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            {deleting ? 'Deletando...' : 'Deletar Tese'}
          </Button>
          <Button onClick={() => setUploadDialogOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Adicionar Capítulo
          </Button>
        </div>
      </div>

      {/* Chapters Tree */}
      {chapters.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nenhum capítulo nesta tese</h3>
            <p className="text-muted-foreground mb-4">
              Adicione capítulos para começar a trabalhar na sua tese
            </p>
            <Button onClick={() => setUploadDialogOpen(true)}>
              <Upload className="mr-2 h-4 w-4" />
              Adicionar Capítulo
            </Button>
          </CardContent>
        </Card>
      ) : (
        <ThesisTree
          chapters={chapters}
          onDeleteChapter={handleDeleteChapter}
        />
      )}

      {/* Upload Dialog */}
      <UploadChapterDialog
        thesisId={thesisId}
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
        onUploadComplete={loadThesis}
        suggestedOrder={suggestedOrder}
      />
    </div>
  );
}
