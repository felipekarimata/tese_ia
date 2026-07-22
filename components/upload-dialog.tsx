'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Upload, Loader2 } from 'lucide-react';

interface UploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploadComplete: () => void;
  projectId?: string; // Opcional: se fornecido, associa documento ao projeto
}

export function UploadDialog({ open, onOpenChange, onUploadComplete, projectId }: UploadDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      toast.error('Selecione um arquivo');
      return;
    }

    setUploading(true);
    setProgress(30);

    try {
      // Upload file
      const formData = new FormData();
      formData.append('file', file);

      const uploadRes = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });

      if (!uploadRes.ok) {
        throw new Error('Falha no upload');
      }

      const { documentId, filePath, fileName } = await uploadRes.json();
      setProgress(60);

      // Ingest document
      const ingestRes = await fetch('/api/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId,
          filePath,
          fileName,
          projectId: projectId || undefined
        })
      });

      if (!ingestRes.ok) {
        throw new Error('Falha no processamento');
      }

      setProgress(100);
      toast.success('Documento carregado com sucesso!');
      onUploadComplete();
      onOpenChange(false);

      // Reset
      setFile(null);
      setProgress(0);
    } catch (error: any) {
      toast.error(error.message || 'Erro ao carregar documento');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload de Documento</DialogTitle>
          <DialogDescription>
            Envie um arquivo PDF, DOCX ou TXT para análise
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="file">Arquivo</Label>
            <Input
              id="file"
              type="file"
              accept=".pdf,.docx,.txt"
              onChange={handleFileChange}
              disabled={uploading}
            />
          </div>

          {file && (
            <div className="text-sm text-muted-foreground">
              Arquivo selecionado: {file.name} ({(file.size / 1024).toFixed(2)} KB)
            </div>
          )}

          {uploading && (
            <div className="space-y-2">
              <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-sm text-muted-foreground text-center">
                Processando... {progress}%
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={uploading}>
            Cancelar
          </Button>
          <Button onClick={handleUpload} disabled={!file || uploading}>
            {uploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Enviando...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Enviar
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
