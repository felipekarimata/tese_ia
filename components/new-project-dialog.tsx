'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { FolderPlus } from 'lucide-react';

type NewProjectDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProjectCreated: () => void;
};

export function NewProjectDialog({ open, onOpenChange, onProjectCreated }: NewProjectDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error('Nome do projeto é obrigatório');
      return;
    }

    try {
      setCreating(true);
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined
        })
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Falha ao criar projeto');
      }

      toast.success('Projeto criado com sucesso!');
      setName('');
      setDescription('');
      onOpenChange(false);
      onProjectCreated();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo Projeto</DialogTitle>
          <DialogDescription>
            Crie um projeto para organizar seus documentos e capítulos
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="project-name">Nome do Projeto *</Label>
            <Input
              id="project-name"
              placeholder="Ex: Tese de Doutorado"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleCreate();
                }
              }}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="project-description">Descrição (opcional)</Label>
            <Textarea
              id="project-description"
              placeholder="Descreva brevemente o objetivo deste projeto..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={creating}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleCreate}
              disabled={creating || !name.trim()}
            >
              <FolderPlus className="w-4 h-4 mr-2" />
              {creating ? 'Criando...' : 'Criar Projeto'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
