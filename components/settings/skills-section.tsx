'use client';

import { useMemo, useState } from 'react';
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
  BUILTIN_SKILL_KEYS,
  SKILL_KEY_LABELS,
  type CustomSkill,
  type SkillKey,
  type SkillsSettings,
} from '@/lib/skills/types';
import { getDefaultPromptBuilder } from '@/lib/skills/defaults';
import { validateCustomSkillName } from '@/lib/skills/resolver';
import { Plus, RotateCcw, Trash2 } from 'lucide-react';

const PLACEHOLDER_HINT =
  'Placeholders: {{args}}, {{style}}, {{section}}, {{paragraphs}}, {{document}}, {{creativity}}, {{audience}}, {{language}}';

type SkillsSectionProps = {
  settings: AppSettings | null;
  setSkillOverride: (key: string, value: string) => void;
  clearSkillOverride: (key: string) => void;
  updateSkills: (patch: Partial<SkillsSettings>) => void;
};

function getBuiltinDefaultPreview(key: SkillKey): string {
  const builder = getDefaultPromptBuilder(key);
  return builder({
    args: 'exemplo de instrução',
    style: 'acadêmico',
    section: 'Introdução',
    paragraphs: '[1] Texto de exemplo...',
    document: '[[P0001]]Texto...[[/P0001]]',
    creativity: 5,
    audience: 'público geral',
    language: 'português',
  });
}

export function SkillsSection({
  settings,
  setSkillOverride,
  clearSkillOverride,
  updateSkills,
}: SkillsSectionProps) {
  const [tab, setTab] = useState<'builtin' | 'custom'>('builtin');
  const [expandedKey, setExpandedKey] = useState<SkillKey | null>('adjust');

  const skills = settings?.skills;
  const overrides = skills?.promptOverrides ?? {};
  const customSkills = skills?.customSkills ?? [];

  const [draft, setDraft] = useState<Partial<CustomSkill>>({
    name: '',
    description: '',
    operation: 'adjust',
    prompt: '',
  });

  const directKeys = useMemo(
    () => BUILTIN_SKILL_KEYS.filter((k) => !k.startsWith('todos:')),
    []
  );
  const todosKeys = useMemo(
    () => BUILTIN_SKILL_KEYS.filter((k) => k.startsWith('todos:')),
    []
  );

  const renderBuiltinGroup = (keys: SkillKey[], title: string) => (
    <div className="space-y-3">
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      {keys.map((key) => {
        const isExpanded = expandedKey === key;
        const current = overrides[key] ?? '';
        const isOverridden = Boolean(current.trim());
        return (
          <div key={key} className="border rounded-lg overflow-hidden">
            <button
              type="button"
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/50"
              onClick={() => setExpandedKey(isExpanded ? null : key)}
            >
              <span className="font-medium">{SKILL_KEY_LABELS[key]}</span>
              {isOverridden && (
                <Badge variant="secondary" className="text-xs">
                  Personalizado
                </Badge>
              )}
            </button>
            {isExpanded && (
              <div className="px-4 pb-4 space-y-2 border-t">
                <p className="text-xs text-muted-foreground pt-2">{PLACEHOLDER_HINT}</p>
                <Textarea
                  rows={10}
                  className="font-mono text-xs"
                  value={current}
                  placeholder={getBuiltinDefaultPreview(key).slice(0, 200) + '...'}
                  onChange={(e) => setSkillOverride(key, e.target.value)}
                />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => clearSkillOverride(key)}
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
          Skills built-in
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
          {renderBuiltinGroup(directKeys, 'Comandos diretos')}
          {renderBuiltinGroup(todosKeys, 'Pipeline /todos')}
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
