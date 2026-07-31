'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { DEFAULT_DOCUMENT_PROCESSING } from '@/lib/document-processing/mode';
import type { SkillsSettings } from '@/lib/skills/types';
import { DEFAULT_SKILLS_SETTINGS } from '@/lib/skills/types';
import { dispatchSettingsUpdated } from './events';
import type { Multi3Settings } from '@/lib/multi-ai/types';
import { DEFAULT_MULTI3_SETTINGS, normalizeMulti3Settings } from '@/lib/multi-ai/models';

export type AIProviderKey = 'openai' | 'gemini' | 'grok' | 'anthropic';

export type AppSettings = {
  hasOpenaiKey?: boolean;
  hasGoogleKey?: boolean;
  hasXaiKey?: boolean;
  hasAnthropicKey?: boolean;
  models?: Record<AIProviderKey, string[]>;
  multi3?: Multi3Settings;
  documentProcessing?: {
    mode?: string;
    maxWholeDocumentChars?: number;
    ragTopK?: number;
    fullContextMaxChars?: number;
  };
  skills?: SkillsSettings;
  pricesUSD?: Record<string, { in: number; out: number }>;
};

export type PendingKeyUpdates = {
  openaiKey?: string;
  googleKey?: string;
  xaiKey?: string;
  anthropicKey?: string;
};

const KEY_FIELDS: (keyof PendingKeyUpdates)[] = [
  'openaiKey',
  'googleKey',
  'xaiKey',
  'anthropicKey',
];

export async function fetchAppSettings(): Promise<AppSettings | null> {
  const res = await fetch('/api/settings');
  if (!res.ok) return null;
  const data = await res.json();
  return data.settings ?? null;
}

export function useSettingsForm(options?: { autoLoad?: boolean; loadModelsOnMount?: boolean }) {
  const autoLoad = options?.autoLoad !== false;
  const loadModelsOnMount = options?.loadModelsOnMount !== false;

  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [pendingKeys, setPendingKeys] = useState<PendingKeyUpdates>({});
  const [loading, setLoading] = useState(autoLoad);
  const [saving, setSaving] = useState(false);
  const [loadingModels, setLoadingModels] = useState<Record<string, boolean>>({});
  const [availableModels, setAvailableModels] = useState<Record<AIProviderKey, string[]>>({
    openai: [],
    gemini: [],
    grok: [],
    anthropic: [],
  });

  const loadSettings = useCallback(async () => {
    try {
      const s = await fetchAppSettings();
      if (s) {
        setSettings(s);
        setPendingKeys({});
      }
      return s;
    } catch {
      toast.error('Erro ao carregar configurações');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAllModels = useCallback(async (provider: AIProviderKey) => {
    setLoadingModels((prev) => ({ ...prev, [provider]: true }));
    try {
      const res = await fetch('/api/models/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      });
      if (!res.ok) throw new Error('Falha ao buscar modelos');
      const data = await res.json();
      setAvailableModels((prev) => ({ ...prev, [provider]: data.models }));
    } catch (e) {
      console.error(`${provider} models error:`, e);
    } finally {
      setLoadingModels((prev) => ({ ...prev, [provider]: false }));
    }
  }, []);

  const loadModelsForConfiguredKeys = useCallback(
    async (s: AppSettings | null) => {
      if (!s) return;
      if (s.hasOpenaiKey) await loadAllModels('openai');
      if (s.hasGoogleKey) await loadAllModels('gemini');
      if (s.hasXaiKey) await loadAllModels('grok');
      if (s.hasAnthropicKey) await loadAllModels('anthropic');
    },
    [loadAllModels]
  );

  useEffect(() => {
    if (!autoLoad) return;
    loadSettings().then((s) => {
      if (loadModelsOnMount) loadModelsForConfiguredKeys(s);
    });
  }, [autoLoad, loadModelsOnMount, loadSettings, loadModelsForConfiguredKeys]);

  const updateDocumentProcessing = useCallback((patch: Record<string, unknown>) => {
    setSettings((prev) => ({
      ...prev,
      documentProcessing: {
        ...DEFAULT_DOCUMENT_PROCESSING,
        ...prev?.documentProcessing,
        ...patch,
      },
    }));
  }, []);

  const resetDocumentProcessingDefaults = useCallback(() => {
    setSettings((prev) => ({
      ...prev,
      documentProcessing: { ...DEFAULT_DOCUMENT_PROCESSING },
    }));
  }, []);

  const updateSkills = useCallback((patch: Partial<SkillsSettings>) => {
    setSettings((prev) => ({
      ...prev,
      skills: {
        ...DEFAULT_SKILLS_SETTINGS,
        ...prev?.skills,
        ...patch,
      },
    }));
  }, []);

  const updateMulti3 = useCallback((patch: Partial<Multi3Settings>) => {
    setSettings((prev) => ({
      ...prev,
      multi3: normalizeMulti3Settings(
        {
          ...DEFAULT_MULTI3_SETTINGS,
          ...prev?.multi3,
          ...patch,
          defaultModels: {
            ...DEFAULT_MULTI3_SETTINGS.defaultModels,
            ...prev?.multi3?.defaultModels,
            ...patch.defaultModels,
          },
        },
        prev?.models
      ),
    }));
  }, []);

  const setSkillOverride = useCallback((key: string, value: string) => {
    setSettings((prev) => ({
      ...prev,
      skills: {
        ...DEFAULT_SKILLS_SETTINGS,
        ...prev?.skills,
        promptOverrides: {
          ...prev?.skills?.promptOverrides,
          [key]: value,
        },
      },
    }));
  }, []);

  const clearSkillOverride = useCallback((key: string) => {
    setSettings((prev) => {
      const overrides = { ...prev?.skills?.promptOverrides };
      delete overrides[key as keyof typeof overrides];
      return {
        ...prev,
        skills: {
          ...DEFAULT_SKILLS_SETTINGS,
          ...prev?.skills,
          promptOverrides: overrides,
        },
      };
    });
  }, []);

  const setPendingKey = useCallback((field: keyof PendingKeyUpdates, value: string) => {
    setPendingKeys((prev) => ({ ...prev, [field]: value }));
  }, []);

  const toggleModel = useCallback((provider: AIProviderKey, model: string) => {
    setSettings((prev) => {
      const currentModels = prev?.models?.[provider] || [];
      const isSelected = currentModels.includes(model);
      const newModels = isSelected
        ? currentModels.filter((m) => m !== model)
        : [...currentModels, model];
      const models = { ...prev?.models, [provider]: newModels } as Record<AIProviderKey, string[]>;
      return {
        ...prev,
        models,
        multi3: normalizeMulti3Settings(prev?.multi3, models),
      };
    });
  }, []);

  const saveSettings = useCallback(
    async (notify = true) => {
      if (!settings) return false;
      setSaving(true);
      try {
        const payload: Record<string, unknown> = {
          models: settings.models,
          multi3: settings.multi3 ?? DEFAULT_MULTI3_SETTINGS,
          documentProcessing: settings.documentProcessing,
          skills: settings.skills ?? DEFAULT_SKILLS_SETTINGS,
        };

        for (const field of KEY_FIELDS) {
          const value = pendingKeys[field];
          if (value && value.trim()) {
            payload[field] = value.trim();
          }
        }

        const res = await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('Falha ao salvar');

        const data = await res.json();
        if (data.settings) {
          setSettings(data.settings);
          setPendingKeys({});
        }

        if (notify) {
          toast.success('Configurações salvas com sucesso!');
          dispatchSettingsUpdated();
        }
        return true;
      } catch (e: any) {
        toast.error(e.message || 'Erro ao salvar configurações');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [settings, pendingKeys]
  );

  return {
    settings,
    setSettings,
    pendingKeys,
    setPendingKey,
    loading,
    saving,
    loadingModels,
    availableModels,
    loadSettings,
    loadAllModels,
    loadModelsForConfiguredKeys,
    updateDocumentProcessing,
    resetDocumentProcessingDefaults,
    updateSkills,
    updateMulti3,
    setSkillOverride,
    clearSkillOverride,
    toggleModel,
    saveSettings,
  };
}
