'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FileText, Loader2, Download } from 'lucide-react';
import { toast } from 'sonner';

type ChapterWithVersions = {
  id: string;
  title: string;
  chapterOrder: number;
  currentVersionId: string | null;
  versions: {
    id: string;
    versionNumber: number;
    pages: number | null;
    createdByOperation: string;
    createdAt: string;
  }[];
};

type CompileThesisDialogProps = {
  thesisId: string;
  thesisTitle: string;
  chapters: ChapterWithVersions[];
  children: React.ReactNode;
};

export function CompileThesisDialog({
  thesisId,
  thesisTitle,
  chapters,
  children,
}: CompileThesisDialogProps) {
  const [open, setOpen] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [includeCoverPage, setIncludeCoverPage] = useState(false);

  // Initialize selections with current versions
  const [selections, setSelections] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    chapters.forEach(chapter => {
      if (chapter.currentVersionId) {
        initial[chapter.id] = chapter.currentVersionId;
      } else if (chapter.versions.length > 0) {
        // Default to latest version if no current version set
        initial[chapter.id] = chapter.versions[0].id;
      }
    });
    return initial;
  });

  const handleVersionChange = (chapterId: string, versionId: string) => {
    setSelections(prev => ({
      ...prev,
      [chapterId]: versionId,
    }));
  };

  const getOperationLabel = (operation: string) => {
    switch (operation) {
      case 'upload': return 'Upload';
      case 'improve': return 'Melhorado';
      case 'translate': return 'Traduzido';
      case 'adjust': return 'Ajustado';
      case 'adapt': return 'Adaptado';
      case 'update': return 'Atualizado';
      default: return operation;
    }
  };

  const handleCompile = async () => {
    // Validate that all chapters have a selected version
    const chaptersWithoutSelection = chapters.filter(ch => !selections[ch.id]);
    if (chaptersWithoutSelection.length > 0) {
      toast.error('Selecione uma versão para todos os capítulos');
      return;
    }

    try {
      setProcessing(true);
      toast.info('Compilando tese...');

      const chapterSelections = chapters.map(chapter => ({
        chapterId: chapter.id,
        versionId: selections[chapter.id],
      }));

      const response = await fetch(`/api/theses/${thesisId}/compile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chapterSelections,
          options: {
            includeCoverPage,
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Falha ao compilar tese');
      }

      const data = await response.json();

      toast.success(`Tese compilada com sucesso! Versão ${data.versionNumber}`);

      // Download the compiled file
      const downloadUrl = data.downloadUrl;
      const downloadResponse = await fetch(downloadUrl);

      if (!downloadResponse.ok) {
        throw new Error('Falha ao fazer download');
      }

      const blob = await downloadResponse.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${thesisTitle.replace(/\s+/g, '_')}_v${data.versionNumber}.docx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success('Download iniciado!');

      // Close dialog
      setOpen(false);

    } catch (error: any) {
      console.error('[COMPILE-DIALOG] Error:', error);
      toast.error(error.message || 'Erro ao compilar tese');
    } finally {
      setProcessing(false);
    }
  };

  const getTotalPages = () => {
    let total = 0;
    chapters.forEach(chapter => {
      const selectedVersionId = selections[chapter.id];
      if (selectedVersionId) {
        const version = chapter.versions.find(v => v.id === selectedVersionId);
        if (version?.pages) {
          total += version.pages;
        }
      }
    });
    return total;
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Compilar Tese
          </DialogTitle>
          <DialogDescription>
            Selecione a versão de cada capítulo para criar um documento único compilado
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-4 py-4 pr-4">
            {/* Chapter selections */}
            <div className="space-y-3">
              {chapters
                .sort((a, b) => a.chapterOrder - b.chapterOrder)
                .map(chapter => {
                  const selectedVersionId = selections[chapter.id];
                  const selectedVersion = chapter.versions.find(v => v.id === selectedVersionId);

                  return (
                    <div
                      key={chapter.id}
                      className="flex items-center gap-4 p-3 bg-muted rounded-lg"
                    >
                      {/* Chapter info */}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">
                          Capítulo {chapter.chapterOrder}: {chapter.title}
                        </div>
                        {selectedVersion && (
                          <div className="text-xs text-muted-foreground mt-1">
                            {selectedVersion.pages ? `${selectedVersion.pages} páginas` : 'Páginas desconhecidas'} · {getOperationLabel(selectedVersion.createdByOperation)}
                          </div>
                        )}
                      </div>

                      {/* Version selector */}
                      <div className="w-48">
                        <Select
                          value={selectedVersionId || ''}
                          onValueChange={(value) => handleVersionChange(chapter.id, value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecionar versão" />
                          </SelectTrigger>
                          <SelectContent>
                            {chapter.versions.map(version => (
                              <SelectItem key={version.id} value={version.id}>
                                Versão {version.versionNumber}
                                {version.id === chapter.currentVersionId && ' (Atual)'}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  );
                })}
            </div>

            {/* Summary */}
            <div className="border-t pt-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total de capítulos:</span>
                <span className="font-medium">{chapters.length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total de páginas estimado:</span>
                <span className="font-medium">{getTotalPages() || '—'}</span>
              </div>
            </div>

            {/* Options */}
            <div className="border-t pt-4 space-y-3">
              <Label className="text-sm font-medium">Opções de Compilação</Label>

              <div className="flex items-start space-x-3 p-3 bg-muted/50 rounded-lg">
                <Checkbox
                  id="cover-page"
                  checked={includeCoverPage}
                  onCheckedChange={(checked) => setIncludeCoverPage(checked as boolean)}
                />
                <div className="space-y-1 flex-1">
                  <Label
                    htmlFor="cover-page"
                    className="text-sm font-medium cursor-pointer"
                  >
                    Incluir página de capa
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Adiciona uma capa com o título da tese e data de compilação
                  </p>
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => setOpen(false)}
            disabled={processing}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleCompile}
            disabled={processing || chapters.some(ch => !selections[ch.id])}
          >
            {processing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Compilando...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Compilar e Baixar
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
