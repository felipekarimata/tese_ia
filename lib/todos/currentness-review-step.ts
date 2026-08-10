import fs from 'fs/promises';
import type { AIProvider } from '@/lib/ai/types';
import {
  reviewDocumentCurrentness,
  type CurrentnessFinding,
} from '@/lib/currentness-review';
import { extractCurrentnessDocument } from '@/lib/currentness-document';
import {
  applyNormUpdatesToDocx,
  type NormUpdateApplyResult,
} from '@/lib/norms-update/apply-docx';

export type TodosCurrentnessProgress = {
  phase: 'extract' | 'research' | 'apply' | 'completed';
  percentage: number;
  label: string;
  current?: number;
  total?: number;
};

export type TodosCurrentnessReviewOptions = {
  inputPath: string;
  outputPath: string;
  provider: AIProvider;
  model: string;
  apiKey: string;
  onLog?: (message: string) => Promise<void> | void;
  onProgress?: (progress: TodosCurrentnessProgress) => Promise<void> | void;
};

export type TodosCurrentnessReviewResult = {
  findings: CurrentnessFinding[];
  applicableFindings: CurrentnessFinding[];
  applyResult: NormUpdateApplyResult | null;
};

export type TodosCurrentnessReviewDependencies = {
  extractDocument: typeof extractCurrentnessDocument;
  reviewDocument: typeof reviewDocumentCurrentness;
  applyUpdates: typeof applyNormUpdatesToDocx;
  copyFile: typeof fs.copyFile;
};

const defaultDependencies: TodosCurrentnessReviewDependencies = {
  extractDocument: extractCurrentnessDocument,
  reviewDocument: reviewDocumentCurrentness,
  applyUpdates: applyNormUpdatesToDocx,
  copyFile: fs.copyFile,
};

/**
 * Runs the same grounded, deep currentness review used by standalone /revisar,
 * then automatically applies only findings that include replacement text.
 */
export async function runTodosCurrentnessReviewStep(
  options: TodosCurrentnessReviewOptions,
  dependencies: TodosCurrentnessReviewDependencies = defaultDependencies
): Promise<TodosCurrentnessReviewResult> {
  await options.onProgress?.({
    phase: 'extract',
    percentage: 2,
    label: 'Extraindo estrutura para revisão aprofundada',
  });

  const { structure, paragraphs } = await dependencies.extractDocument(options.inputPath);

  await options.onProgress?.({
    phase: 'research',
    percentage: 5,
    label: 'Pesquisando vigência, fatos e dados na web',
  });

  const findings = await dependencies.reviewDocument({
    paragraphs,
    sections: structure.sections,
    provider: options.provider,
    model: options.model,
    apiKey: options.apiKey,
    depth: 'deep',
    onLog: options.onLog,
    onProgress: async (current, total) => {
      await options.onProgress?.({
        phase: 'research',
        percentage: 5 + Math.round((current / Math.max(1, total)) * 87),
        label: `Pesquisa aprofundada — bloco ${current}/${total}`,
        current,
        total,
      });
    },
  });

  const applicableFindings = findings.filter(
    (finding) => typeof finding.suggestedText === 'string' && finding.suggestedText.trim().length > 0
  );

  let applyResult: NormUpdateApplyResult | null = null;
  if (applicableFindings.length === 0) {
    await dependencies.copyFile(options.inputPath, options.outputPath);
  } else {
    await options.onProgress?.({
      phase: 'apply',
      percentage: 96,
      label: `Aplicando ${applicableFindings.length} atualização(ões) fundamentada(s)`,
    });
    applyResult = await dependencies.applyUpdates(
      options.inputPath,
      options.outputPath,
      applicableFindings
    );
  }

  await options.onProgress?.({
    phase: 'completed',
    percentage: 100,
    label: applicableFindings.length > 0
      ? `Revisão concluída — ${applyResult?.appliedCount ?? 0}/${applicableFindings.length} atualização(ões) aplicada(s)`
      : 'Revisão concluída sem atualizações factuais suficientemente sustentadas',
  });

  return { findings, applicableFindings, applyResult };
}
