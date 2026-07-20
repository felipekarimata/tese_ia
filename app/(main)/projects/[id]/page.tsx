'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { UploadDialog } from '@/components/upload-dialog';
import { FileText, Upload, ArrowLeft, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

type Project = {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  documentCount: number;
};

type Document = {
  id: string;
  title: string;
  pages: number;
  chunksCount: number;
};

export default function ProjectPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadProject = async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      if (!res.ok) {
        if (res.status === 404) {
          toast.error('Projeto não encontrado');
          router.push('/');
          return;
        }
        throw new Error('Falha ao carregar projeto');
      }
      const data = await res.json();
      setProject(data.project);
      setDocuments(data.documents || []);
    } catch (error: any) {
      toast.error(error.message || 'Erro ao carregar projeto');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!confirm('Tem certeza que deseja deletar este projeto? Os documentos não serão deletados, apenas desassociados do projeto.')) {
      return;
    }

    try {
      setDeleting(true);
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'DELETE'
      });

      if (!res.ok) {
        throw new Error('Falha ao deletar projeto');
      }

      toast.success('Projeto deletado com sucesso');
      router.push('/');
    } catch (error: any) {
      toast.error(error.message);
      setDeleting(false);
    }
  };

  useEffect(() => {
    loadProject();
  }, [projectId]);

  if (loading) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Carregando projeto...</p>
      </div>
    );
  }

  if (!project) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push('/')}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
      </div>

      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h1 className="text-3xl font-bold">{project.name}</h1>
          {project.description && (
            <p className="text-muted-foreground mt-2">
              {project.description}
            </p>
          )}
          <div className="flex items-center gap-4 mt-4">
            <Badge variant="secondary">
              {project.documentCount} {project.documentCount === 1 ? 'documento' : 'documentos'}
            </Badge>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDeleteProject}
            disabled={deleting}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            {deleting ? 'Deletando...' : 'Deletar Projeto'}
          </Button>
          <Button onClick={() => setUploadDialogOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Adicionar Documento
          </Button>
        </div>
      </div>

      {documents.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nenhum documento neste projeto</h3>
            <p className="text-muted-foreground mb-4">
              Adicione documentos para começar a trabalhar
            </p>
            <Button onClick={() => setUploadDialogOpen(true)}>
              <Upload className="mr-2 h-4 w-4" />
              Adicionar Documento
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {documents.map((doc) => (
            <Link key={doc.id} href={`/documents/${doc.id}`}>
              <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <FileText className="h-8 w-8 text-primary" />
                    <Badge variant="secondary">{doc.pages} páginas</Badge>
                  </div>
                  <CardTitle className="line-clamp-2">{doc.title}</CardTitle>
                  <CardDescription>
                    {doc.chunksCount} chunks processados
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <UploadDialog
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
        onUploadComplete={loadProject}
        projectId={projectId}
      />
    </div>
  );
}
