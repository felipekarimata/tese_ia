export type ChapterVersionForLabel = {
  id: string;
  versionNumber: number;
  createdByOperation: string;
  isCurrent: boolean;
  metadata?: Record<string, unknown>;
};

const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  gemini: 'Google Gemini',
  grok: 'xAI Grok',
  anthropic: 'Anthropic Claude',
};

const STEP_LABELS: Record<string, string> = {
  translate: 'Tradução',
  review: 'Revisão',
  improve: 'Aprimoramento',
  finalize: 'Finalização',
};

const OPERATION_LABELS: Record<string, string> = {
  upload: 'Original',
  translate: 'Tradução',
  update: 'Revisão',
  improve: 'Aprimoramento',
  adjust: 'Ajuste editorial',
  adapt: 'Adaptação',
};

function metadataString(version: ChapterVersionForLabel, key: string): string | undefined {
  const value = version.metadata?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function providerLabel(version: ChapterVersionForLabel): string | undefined {
  const provider = metadataString(version, 'multi3Provider');
  return provider ? PROVIDER_LABELS[provider] || provider : undefined;
}

export function isMulti3FinalVersion(version: ChapterVersionForLabel): boolean {
  return metadataString(version, 'multi3Role') === 'judge-final'
    || metadataString(version, 'multi3Step') === 'finalize';
}

export function chapterVersionLabel(version: ChapterVersionForLabel): string {
  const provider = providerLabel(version);
  const role = metadataString(version, 'multi3Role');
  const step = metadataString(version, 'multi3Step');
  const model = metadataString(version, 'judgeModel') || metadataString(version, 'multi3Model');

  let description: string;
  if (role === 'judge-final') {
    const editor = provider || 'IA';
    description = `Redação final (${editor}${model ? ` · ${model}` : ''})`;
  } else if (step === 'finalize' && provider) {
    description = `Final ${provider}${model ? ` · ${model}` : ''}`;
  } else if (step && provider) {
    description = `${provider} · ${STEP_LABELS[step] || step}`;
  } else {
    description = OPERATION_LABELS[version.createdByOperation]
      || version.createdByOperation
      || 'Versão';
  }

  return `v${version.versionNumber} - ${description}${version.isCurrent ? ' · atual' : ''}`;
}

export function chapterVersionSelectorGroups<T extends ChapterVersionForLabel>(
  versions: T[],
  selectedVersionId?: string
): { primary: T[]; secondary: T[]; hasMulti3Finals: boolean } {
  const sorted = [...versions].sort((left, right) => right.versionNumber - left.versionNumber);
  const finals = sorted.filter(isMulti3FinalVersion);

  if (finals.length === 0) {
    return { primary: sorted, secondary: [], hasMulti3Finals: false };
  }

  const latestSessionId = metadataString(finals[0], 'multi3SessionId');
  const latestFinals = latestSessionId
    ? finals.filter((version) => metadataString(version, 'multi3SessionId') === latestSessionId)
    : finals;
  const primaryIds = new Set(latestFinals.map((version) => version.id));
  for (const version of sorted) {
    if (version.isCurrent || version.id === selectedVersionId) primaryIds.add(version.id);
  }

  return {
    primary: sorted.filter((version) => primaryIds.has(version.id)),
    secondary: sorted.filter((version) => !primaryIds.has(version.id)),
    hasMulti3Finals: true,
  };
}
