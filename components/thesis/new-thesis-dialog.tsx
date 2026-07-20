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
import { Textarea } from '@/components/ui/textarea';
import { BookOpen } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

type NewThesisDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onThesisCreated?: () => void;
};

export function NewThesisDialog({
  open,
  onOpenChange,
  onThesisCreated,
}: NewThesisDialogProps) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!title.trim()) {
      toast.error('Por favor, insira um título para a tese');
      return;
    }

    try {
      setCreating(true);

      const response = await fetch('/api/theses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Falha ao criar tese');
      }

      const data = await response.json();

      console.log('[NEW-THESIS] Thesis created:', data.thesis);

      toast.success(`Tese "${title}" criada com sucesso!`);

      // Reset form
      setTitle('');
      setDescription('');
      onOpenChange(false);

      // Notify parent or navigate
      if (onThesisCreated) {
        onThesisCreated();
      } else {
        // Navigate to the new thesis
        router.push(`/theses/${data.thesis.id}`);
      }
    } catch (error: any) {
      console.error('[NEW-THESIS] Error:', error);
      toast.error(error.message || 'Erro ao criar tese');
    } finally {
      setCreating(false);
    }
  };

  const handleClose = () => {
    if (!creating) {
      setTitle('');
      setDescription('');
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            Nova Tese
          </DialogTitle>
          <DialogDescription>
            Crie uma nova tese para organizar seus capítulos e versões
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Title Input */}
          <div>
            <Label htmlFor="thesis-title">Título *</Label>
            <Input
              id="thesis-title"
              type="text"
              placeholder="Ex: Minha Tese de Mestrado"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={creating}
              className="mt-2"
              autoFocus
            />
          </div>

          {/* Description Input */}
          <div>
            <Label htmlFor="thesis-description">
              Descrição{' '}
              <span className="text-xs text-muted-foreground">(opcional)</span>
            </Label>
            <Textarea
              id="thesis-description"
              placeholder="Breve descrição da tese..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={creating}
              className="mt-2 min-h-[100px]"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 justify-end pt-4">
            <Button variant="outline" onClick={handleClose} disabled={creating}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={!title.trim() || creating}>
              {creating ? (
                <>Criando...</>
              ) : (
                <>
                  <BookOpen className="mr-2 h-4 w-4" />
                  Criar Tese
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
