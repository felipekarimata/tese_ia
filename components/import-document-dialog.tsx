'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Upload, FileText, X, BookOpen, Folder, ArrowLeft, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

type ImportStep = 'upload' | 'choose-type' | 'details';
type DocumentType = 'thesis' | 'project';

type ImportDocumentDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
};

export function ImportDocumentDialog({ open, onOpenChange, onCreated }: ImportDocumentDialogProps) {
  const router = useRouter();
  const [step, setStep] = useState<ImportStep>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [docType, setDocType] = useState<DocumentType | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const reset = () => {
    setStep('upload');
    setFile(null);
    setDocType(null);
    setTitle('');
    setDescription('');
    setCreating(false);
    setDragOver(false);
  };

  const handleClose = () => {
    if (!creating) {
      reset();
      onOpenChange(false);
    }
  };

  const handleFileSelect = (selectedFile: File) => {
    setFile(selectedFile);
    const nameWithoutExt = selectedFile.name.replace(/\.[^/.]+$/, '');
    setTitle(nameWithoutExt);
    setStep('choose-type');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) handleFileSelect(dropped);
  };

  const handleCreate = async () => {
    if (!file || !title.trim() || !docType) return;

    try {
      setCreating(true);

      if (docType === 'thesis') {
        const thesisRes = await fetch('/api/theses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: title.trim(), description: description.trim() || undefined }),
        });
        if (!thesisRes.ok) throw new Error('Falha ao criar tese');
        const thesisData = await thesisRes.json();

        const formData = new FormData();
        formData.append('file', file);
        formData.append('thesisId', thesisData.thesis.id);
        formData.append('title', 'Capítulo 1');
        formData.append('chapterOrder', '1');

        const chapterRes = await fetch('/api/chapters', { method: 'POST', body: formData });
        if (!chapterRes.ok) throw new Error('Falha ao fazer upload do capítulo');

        toast.success(`Tese "${title}" criada com sucesso!`);
        reset();
        onOpenChange(false);
        onCreated?.();
        router.push(`/theses/${thesisData.thesis.id}`);
      } else {
        const projectRes = await fetch('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: title.trim(), description: description.trim() || undefined }),
        });
        if (!projectRes.ok) throw new Error('Falha ao criar projeto');
        const projectData = await projectRes.json();

        // Step 1: upload raw file
        const formData = new FormData();
        formData.append('file', file);

        const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData });
        if (!uploadRes.ok) throw new Error('Falha no upload do arquivo');
        const { documentId, filePath, fileName } = await uploadRes.json();

        // Step 2: ingest into project
        const ingestRes = await fetch('/api/ingest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            documentId,
            filePath,
            fileName,
            projectId: projectData.project.id,
          }),
        });
        if (!ingestRes.ok) throw new Error('Falha no processamento do documento');

        toast.success(`Projeto "${title}" criado com sucesso!`);
        reset();
        onOpenChange(false);
        onCreated?.();
        router.push(`/projects/${projectData.project.id}`);
      }
    } catch (error: any) {
      toast.error(error.message || 'Erro ao criar documento');
    } finally {
      setCreating(false);
    }
  };

  const stepIndex = step === 'upload' ? 0 : step === 'choose-type' ? 1 : 2;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-[560px] bg-gradient-to-br from-gray-900 via-gray-900 to-black border-white/10 p-0 overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-white/5">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white text-lg">
              {step !== 'upload' && (
                <button
                  onClick={() => setStep(step === 'details' ? 'choose-type' : 'upload')}
                  className="p-1 text-gray-400 hover:text-white transition-colors rounded-md hover:bg-white/10"
                  disabled={creating}
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
              )}
              <span>
                {step === 'upload' && 'Importar Documento'}
                {step === 'choose-type' && 'Como organizar?'}
                {step === 'details' && (docType === 'thesis' ? 'Detalhes da Tese' : 'Detalhes do Projeto')}
              </span>
            </DialogTitle>
          </DialogHeader>

          {/* Progress bar */}
          <div className="flex gap-1.5 mt-4">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className={cn(
                  'h-0.5 flex-1 rounded-full transition-all duration-300',
                  i <= stepIndex ? 'bg-red-500' : 'bg-white/10'
                )}
              />
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {/* Step 1: Upload */}
          {step === 'upload' && (
            <div className="space-y-3">
              <p className="text-sm text-gray-400">
                Comece fazendo o upload do seu documento para a plataforma.
              </p>

              {file ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-4 bg-white/5 border border-white/10 rounded-xl">
                    <FileText className="h-8 w-8 text-red-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{file.name}</p>
                      <p className="text-xs text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                    <button onClick={() => setFile(null)} className="text-gray-500 hover:text-white" title="Remover arquivo">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <Button
                    onClick={() => setStep('choose-type')}
                    className="w-full bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white"
                  >
                    Continuar
                  </Button>
                </div>
              ) : (
                <label
                  className={cn(
                    'flex flex-col items-center justify-center w-full h-44 border-2 border-dashed rounded-xl cursor-pointer transition-all duration-200',
                    dragOver
                      ? 'border-red-500 bg-red-500/10'
                      : 'border-white/15 bg-white/[0.03] hover:border-red-500/40 hover:bg-white/[0.06]'
                  )}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                >
                  <div className={cn(
                    'p-4 rounded-full mb-3 transition-colors',
                    dragOver ? 'bg-red-500/20' : 'bg-white/5'
                  )}>
                    <Upload className={cn('h-7 w-7 transition-colors', dragOver ? 'text-red-400' : 'text-gray-500')} />
                  </div>
                  <p className="text-sm font-medium text-gray-300">Arraste seu arquivo aqui</p>
                  <p className="text-xs text-gray-500 mt-1">ou clique para selecionar</p>
                  <span className="mt-3 text-xs text-gray-600 bg-white/5 px-3 py-1 rounded-full border border-white/10">
                    PDF · DOCX · TXT
                  </span>
                  <input
                    type="file"
                    className="hidden"
                    accept=".pdf,.docx,.doc,.txt"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFileSelect(f);
                    }}
                  />
                </label>
              )}
            </div>
          )}

          {/* Step 2: Choose Type */}
          {step === 'choose-type' && file && (
            <div className="space-y-4">
              {/* File pill */}
              <div className="flex items-center gap-3 px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg">
                <FileText className="h-5 w-5 text-red-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{file.name}</p>
                  <p className="text-xs text-gray-500">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
                </div>
                <button
                  onClick={() => { setFile(null); setStep('upload'); }}
                  className="text-gray-600 hover:text-gray-300 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <p className="text-sm text-gray-400 font-medium">Como você vai trabalhar neste documento?</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={() => { setDocType('thesis'); setStep('details'); }}
                  className="group min-w-0 flex flex-col items-start gap-3 p-4 rounded-xl border-2 border-white/10 bg-white/[0.03] text-left transition-all hover:border-red-500/50 hover:bg-red-500/[0.05]"
                >
                  <div className="p-2.5 bg-red-500/15 rounded-lg group-hover:bg-red-500/25 transition-colors">
                    <BookOpen className="h-5 w-5 text-red-400" />
                  </div>
                  <div className="space-y-1 min-w-0">
                    <p className="text-sm font-semibold text-white">Tese</p>
                    <p className="text-xs text-gray-400 leading-relaxed break-words">
                      Capítulos separados — cada um com seu próprio histórico de versões
                    </p>
                  </div>
                </button>

                <button
                  onClick={() => { setDocType('project'); setStep('details'); }}
                  className="group min-w-0 flex flex-col items-start gap-3 p-4 rounded-xl border-2 border-white/10 bg-white/[0.03] text-left transition-all hover:border-red-500/50 hover:bg-red-500/[0.05]"
                >
                  <div className="p-2.5 bg-red-500/15 rounded-lg group-hover:bg-red-500/25 transition-colors">
                    <Folder className="h-5 w-5 text-red-400" />
                  </div>
                  <div className="space-y-1 min-w-0">
                    <p className="text-sm font-semibold text-white">Projeto</p>
                    <p className="text-xs text-gray-400 leading-relaxed break-words">
                      Documento completo — gerenciado como um único arquivo
                    </p>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Details */}
          {step === 'details' && (
            <div className="space-y-4">
              {/* Type + file summary */}
              <div className="flex items-center gap-2 text-xs text-gray-500">
                {docType === 'thesis' ? (
                  <BookOpen className="h-3.5 w-3.5 text-red-400" />
                ) : (
                  <Folder className="h-3.5 w-3.5 text-red-400" />
                )}
                <span className="text-red-400">{docType === 'thesis' ? 'Tese por capítulos' : 'Projeto completo'}</span>
                <span>·</span>
                <FileText className="h-3.5 w-3.5" />
                <span className="truncate max-w-[200px]">{file?.name}</span>
              </div>

              <div className="space-y-2">
                <Label htmlFor="import-title" className="text-gray-300 text-sm">
                  {docType === 'thesis' ? 'Título da Tese' : 'Nome do Projeto'} *
                </Label>
                <Input
                  id="import-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={docType === 'thesis' ? 'Ex: Minha Tese de Mestrado' : 'Ex: Tese de Doutorado 2024'}
                  disabled={creating}
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter' && title.trim()) handleCreate(); }}
                  className="bg-white/5 border-white/10 text-white placeholder:text-gray-600 focus-visible:ring-red-500/40"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="import-description" className="text-gray-300 text-sm">
                  Descrição{' '}
                  <span className="text-gray-600 text-xs">(opcional)</span>
                </Label>
                <Textarea
                  id="import-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Breve descrição do documento..."
                  disabled={creating}
                  rows={3}
                  className="bg-white/5 border-white/10 text-white placeholder:text-gray-600 focus-visible:ring-red-500/40 resize-none"
                />
              </div>

              <div className="flex gap-2 pt-1">
                <Button
                  variant="ghost"
                  className="flex-1 text-gray-400 hover:text-white hover:bg-white/10 border border-white/10"
                  onClick={handleClose}
                  disabled={creating}
                >
                  Cancelar
                </Button>
                <Button
                  className="flex-1 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white shadow-lg shadow-red-500/20 transition-all"
                  onClick={handleCreate}
                  disabled={!title.trim() || creating}
                >
                  {creating ? (
                    <span className="flex items-center gap-2">
                      <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Criando...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Check className="h-4 w-4" />
                      Criar {docType === 'thesis' ? 'Tese' : 'Projeto'}
                    </span>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
