'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, FileText, X } from 'lucide-react';
import { toast } from 'sonner';

type UploadChapterDialogProps = {
  thesisId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploadComplete?: () => void;
  suggestedOrder?: number; // Auto-filled order suggestion
};

export function UploadChapterDialog({
  thesisId,
  open,
  onOpenChange,
  onUploadComplete,
  suggestedOrder,
}: UploadChapterDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [chapterOrder, setChapterOrder] = useState(suggestedOrder?.toString() || '');
  const [uploading, setUploading] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      // Auto-fill title from filename if empty
      if (!title) {
        const nameWithoutExt = selectedFile.name.replace(/\.[^/.]+$/, '');
        setTitle(nameWithoutExt);
      }
    }
  };

  const handleUpload = async () => {
    if (!file || !title.trim()) {
      toast.error('Por favor, selecione um arquivo e insira um título');
      return;
    }

    try {
      setUploading(true);

      const formData = new FormData();
      formData.append('file', file);
      formData.append('thesisId', thesisId);
      formData.append('title', title.trim());
      if (chapterOrder.trim()) {
        formData.append('chapterOrder', chapterOrder.trim());
      }

      const response = await fetch('/api/chapters', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Falha no upload');
      }

      const data = await response.json();

      console.log('[UPLOAD-CHAPTER] Chapter created:', data);

      toast.success(`Capítulo "${title}" adicionado com sucesso!`);

      // Reset form
      setFile(null);
      setTitle('');
      setChapterOrder('');
      onOpenChange(false);

      // Notify parent
      if (onUploadComplete) {
        onUploadComplete();
      }
    } catch (error: any) {
      console.error('[UPLOAD-CHAPTER] Error:', error);
      toast.error(error.message || 'Erro ao fazer upload do capítulo');
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    if (!uploading) {
      setFile(null);
      setTitle('');
      setChapterOrder('');
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adicionar Capítulo</DialogTitle>
          <DialogDescription>
            Faça upload de um capítulo da tese. Formatos aceitos: PDF, DOCX, TXT.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* File Input */}
          <div>
            <Label htmlFor="chapter-file">Arquivo do Capítulo</Label>
            <div className="mt-2">
              {!file ? (
                <label
                  htmlFor="chapter-file"
                  className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                >
                  <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Clique para selecionar ou arraste aqui
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    PDF, DOCX ou TXT
                  </p>
                  <input
                    id="chapter-file"
                    type="file"
                    className="hidden"
                    accept=".pdf,.docx,.txt"
                    onChange={handleFileChange}
                    disabled={uploading}
                  />
                </label>
              ) : (
                <div className="flex items-center gap-3 p-3 border rounded-lg">
                  <FileText className="h-8 w-8 text-primary" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setFile(null)}
                    disabled={uploading}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Title Input */}
          <div>
            <Label htmlFor="chapter-title">Título do Capítulo *</Label>
            <Input
              id="chapter-title"
              type="text"
              placeholder="Ex: Introdução"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={uploading}
              className="mt-2"
            />
          </div>

          {/* Chapter Order Input */}
          <div>
            <Label htmlFor="chapter-order">
              Ordem do Capítulo{' '}
              <span className="text-xs text-muted-foreground">(opcional)</span>
            </Label>
            <Input
              id="chapter-order"
              type="number"
              min="1"
              placeholder={suggestedOrder ? `Sugerido: ${suggestedOrder}` : 'Ex: 1'}
              value={chapterOrder}
              onChange={(e) => setChapterOrder(e.target.value)}
              disabled={uploading}
              className="mt-2"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Se não especificado, será atribuído automaticamente
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-2 justify-end pt-4">
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={uploading}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleUpload}
              disabled={!file || !title.trim() || uploading}
            >
              {uploading ? (
                <>Fazendo upload...</>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Adicionar Capítulo
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
