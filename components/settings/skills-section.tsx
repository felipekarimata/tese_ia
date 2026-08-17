'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { AppSettings } from './use-settings-form';
import {
  type CustomSkill,
  type SkillsSettings,
} from '@/lib/skills/types';
import { validateCustomSkillName } from '@/lib/skills/resolver';
import {
  COMMAND_PROMPT_DEFINITIONS,
  resolveCommandPrompt,
  type CommandPromptKey,
} from '@/lib/book-workflow/prompts';
import { Plus, RotateCcw, Trash2 } from 'lucide-react';

const PLACEHOLDER_HINT =
  'Placeholders: {{args}}, {{style}}, {{section}}, {{paragraphs}}, {{document}}, {{creativity}}, {{audience}}, {{language}}';

type SkillsSectionProps = {
  settings: AppSettings | null;
  setCommandPromptOverride: (key: CommandPromptKey, value: string) => void;
  clearCommandPromptOverride: (key: CommandPromptKey) => void;
  updateSkills: (patch: Partial<SkillsSettings>) => void;
};

export function SkillsSection({
  settings,
  setCommandPromptOverride,
  clearCommandPromptOverride,
  updateSkills,
}: SkillsSectionProps) {
  const [tab, setTab] = useState<'builtin' | 'custom'>('builtin');
  const [expandedKey, setExpandedKey] = useState<CommandPromptKey | null>('translate');

  const skills = settings?.skills;
  const commandPromptOverrides = settings?.commandPrompts ?? {};
  const customSkills = skills?.customSkills ?? [];

  const [draft, setDraft] = useState<Partial<CustomSkill>>({
    name: '',
    description: '',
    operation: 'adjust',
    prompt: '',
  });

  const renderCommandPrompts = () => (
    <div className="space-y-3">
      {COMMAND_PROMPT_DEFINITIONS.map((definition) => {
        const key = definition.key;
        const isExpanded = expandedKey === key;
        const current = resolveCommandPrompt(key, commandPromptOverrides);
        const isOverridden = Boolean(commandPromptOverrides[key]?.trim());
        return (
          <div key={key} className="border rounded-lg overflow-hidden">
            <button
              type="button"
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/50"
              onClick={() => setExpandedKey(isExpanded ? null : key)}
            >
              <div>
                <span className="font-medium text-indigo-300">{definition.label}</span>
                <p className="mt-1 text-xs font-normal text-muted-foreground">
                  {definition.description}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                {definition.usedInTodos && key !== 'todos:final-editor' && (
                  <Badge variant="outline" className="text-xs">Também no /todos</Badge>
                )}
                {isOverridden && (
                  <Badge variant="secondary" className="text-xs">Personalizado</Badge>
                )}
              </div>
            </button>
            {isExpanded && (
              <div className="px-4 pb-4 space-y-2 border-t">
                <p className="text-xs text-muted-foreground pt-2">
                  {definition.placeholderHint
                    || 'Edite somente a orientação editorial. O formato técnico de resposta e as proteções do DOCX continuam controlados pelo sistema.'}
                </p>
                <Textarea
                  rows={14}
                  className="font-mono text-xs"
                  value={current}
                  onChange={(e) => setCommandPromptOverride(key, e.target.value)}
                />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => clearCommandPromptOverride(key)}
                    disabled={!isOverridden}
                  >
                    <RotateCcw className="h-3.5 w-3.5 mr-1" />
                    Restaurar padrão
                  </Button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  const addCustomSkill = () => {
    const name = draft.name?.trim() || '';
    const err = validateCustomSkillName(name, customSkills);
    if (err) {
      alert(err);
      return;
    }
    if (!draft.prompt?.trim()) {
      alert('Informe o prompt da skill');
      return;
    }
    const skill: CustomSkill = {
      id: crypto.randomUUID(),
      name: name.toLowerCase(),
      description: draft.description?.trim() || '',
      operation: draft.operation || 'adjust',
      adaptStyle: draft.operation === 'adapt' ? draft.adaptStyle || 'custom' : undefined,
      prompt: draft.prompt.trim(),
    };
    updateSkills({ customSkills: [...customSkills, skill] });
    setDraft({ name: '', description: '', operation: 'adjust', prompt: '' });
  };

  const removeCustomSkill = (id: string) => {
    updateSkills({ customSkills: customSkills.filter((s) => s.id !== id) });
  };

  const updateCustomSkill = (id: string, patch: Partial<CustomSkill>) => {
    updateSkills({
      customSkills: customSkills.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b pb-2">
        <Button
          type="button"
          variant={tab === 'builtin' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setTab('builtin')}
        >
          Prompts dos comandos
        </Button>
        <Button
          type="button"
          variant={tab === 'custom' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setTab('custom')}
        >
          Skills personalizadas
        </Button>
      </div>

      {tab === 'builtin' ? (
        <div className="space-y-6">
          <div className="rounded-lg border border-blue-900/60 bg-blue-950/20 px-4 py-3 text-sm text-blue-100">
            <p className="font-medium">Uma única instrução por etapa</p>
            <p className="mt-1 text-xs text-blue-200/80">
              `/todos` reutiliza exatamente os prompts salvos de `/traduzir`, `/revisar`,
              `/aprimorar` e `/finalizar`; depois aplica o prompt próprio do redator final.
              `/ajustar` não faz parte do `/todos`. O comando `/comparar` apenas abre versões lado a
              lado e, por isso, não envia prompt a uma IA.
            </p>
          </div>
          {renderCommandPrompts()}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="border rounded-lg p-4 space-y-3 bg-muted/20">
            <p className="text-sm font-medium">Nova skill</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Nome (ex: /expandir-conclusao)</Label>
                <Input
                  value={draft.name || ''}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  placeholder="/minha-skill"
                />
              </div>
              <div className="space-y-1">
                <Label>Operação</Label>
                <Select
                  value={draft.operation || 'adjust'}
                  onValueChange={(v) =>
                    setDraft((d) => ({ ...d, operation: v as CustomSkill['operation'] }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="adjust">Ajustar documento</SelectItem>
                    <SelectItem value="adapt">Adaptar estilo</SelectItem>
                    <SelectItem value="translate">Traduzir</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {draft.operation === 'adapt' && (
              <div className="space-y-1">
                <Label>Estilo (adaptar)</Label>
                <Select
                  value={draft.adaptStyle || 'simplified'}
                  onValueChange={(v) =>
                    setDraft((d) => ({
                      ...d,
                      adaptStyle: v as CustomSkill['adaptStyle'],
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="academic">Acadêmico</SelectItem>
                    <SelectItem value="professional">Profissional</SelectItem>
                    <SelectItem value="simplified">Simplificado</SelectItem>
                    <SelectItem value="custom">Personalizado (usa o prompt abaixo)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1">
              <Label>Descrição</Label>
              <Input
                value={draft.description || ''}
                onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                placeholder="O que esta skill faz"
              />
            </div>
            <div className="space-y-1">
              <Label>Prompt</Label>
              <p className="text-xs text-muted-foreground">{PLACEHOLDER_HINT}</p>
              <Textarea
                rows={5}
                className="font-mono text-xs"
                value={draft.prompt || ''}
                onChange={(e) => setDraft((d) => ({ ...d, prompt: e.target.value }))}
                placeholder="Instruções enviadas ao LLM. Use {{args}} para argumentos do usuário."
              />
            </div>
            <Button type="button" size="sm" onClick={addCustomSkill}>
              <Plus className="h-4 w-4 mr-1" />
              Adicionar skill
            </Button>
          </div>

          {customSkills.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma skill personalizada ainda.</p>
          ) : (
            customSkills.map((skill) => (
              <div key={skill.id} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <Badge variant="outline">{skill.name}</Badge>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeCustomSkill(skill.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
                <Input
                  value={skill.description}
                  onChange={(e) => updateCustomSkill(skill.id, { description: e.target.value })}
                  placeholder="Descrição"
                />
                <Textarea
                  rows={5}
                  className="font-mono text-xs"
                  value={skill.prompt}
                  onChange={(e) => updateCustomSkill(skill.id, { prompt: e.target.value })}
                />
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
