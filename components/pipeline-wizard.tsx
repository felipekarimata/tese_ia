'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Loader2, Rocket, ArrowLeft, ArrowRight, SkipForward } from 'lucide-react';
import { PipelineOperation, OperationConfigs, OPERATION_METADATA } from '@/lib/pipeline/types';
import { getAIErrorMessage } from '@/lib/ai-error-message';
import {
  PIPELINE_OPERATIONS,
  OperationStepContent,
  validateConfig,
  getConfigSummary,
  buildNormalizedConfigs
} from '@/components/pipeline-operation-forms';

type PipelineWizardProps = {
  documentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function PipelineWizard({ documentId, open, onOpenChange }: PipelineWizardProps) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedOps, setSelectedOps] = useState<Set<PipelineOperation>>(new Set());
  const [configs, setConfigs] = useState<Partial<OperationConfigs>>({});
  const [isStarting, setIsStarting] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const totalSteps = PIPELINE_OPERATIONS.length + 1;
  const currentOperation =
    currentStep < PIPELINE_OPERATIONS.length ? PIPELINE_OPERATIONS[currentStep] : null;
  const isReviewStep = currentStep === PIPELINE_OPERATIONS.length;

  const handleNext = () => {
    if (currentStep < totalSteps - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    if (currentOperation) {
      const newSelected = new Set(selectedOps);
      newSelected.delete(currentOperation);
      setSelectedOps(newSelected);

      const newConfigs = { ...configs };
      delete newConfigs[currentOperation];
      setConfigs(newConfigs);
    }
    handleNext();
  };

  const handleConfigure = async () => {
    if (!currentOperation) return;

    const config = configs[currentOperation];
    if (!validateConfig(currentOperation, config)) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    setIsProcessing(true);
    await new Promise((resolve) => setTimeout(resolve, 1000 + Math.random() * 1000));

    setSelectedOps(new Set([...selectedOps, currentOperation]));
    setIsProcessing(false);
    handleNext();
  };

  const handleStartPipeline = async () => {
    if (selectedOps.size === 0) {
      toast.error('Selecione pelo menos uma operação');
      return;
    }

    try {
      setIsStarting(true);

      const orderedOps = PIPELINE_OPERATIONS.filter((op) => selectedOps.has(op));
      const normalizedConfigs = buildNormalizedConfigs(orderedOps, configs);

      const res = await fetch('/api/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId,
          operations: orderedOps,
          configs: normalizedConfigs
        })
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Falha ao iniciar pipeline');
      }

      const data = await res.json();
      toast.success('Pipeline iniciado!');

      setTimeout(() => {
        router.push(`/pipeline/${data.jobId}`);
      }, 500);
    } catch (error: any) {
      console.error('Pipeline start error:', error);
      toast.error(getAIErrorMessage(error, 'Falha ao iniciar pipeline'));
      setIsStarting(false);
    }
  };

  const updateConfig = (key: string, value: any) => {
    if (!currentOperation) return;

    setConfigs((prev) => ({
      ...prev,
      [currentOperation]: {
        ...prev[currentOperation],
        [key]: value
      }
    }));
  };

  const handleEditStep = (step: number) => {
    setCurrentStep(step);
  };

  const estimatedTime = Array.from(selectedOps).reduce((total, op) => {
    return total + (OPERATION_METADATA[op]?.estimatedMinutes || 0);
  }, 0);

  const estimatedCost = selectedOps.size * 0.05;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">
            {isReviewStep
              ? '📋 Revisar Pipeline'
              : `${OPERATION_METADATA[currentOperation!]?.icon} ${OPERATION_METADATA[currentOperation!]?.name}`}
          </DialogTitle>
          <DialogDescription>
            {isReviewStep
              ? 'Revise suas seleções antes de iniciar o processamento'
              : `Passo ${currentStep + 1} de ${PIPELINE_OPERATIONS.length}`}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-500">Progresso</span>
            <span className="text-sm font-medium">
              {currentStep + 1} / {totalSteps}
            </span>
          </div>
          <div className="flex gap-1">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                className={`h-2 flex-1 rounded-full transition-all ${
                  i < currentStep ? 'bg-green-500' : i === currentStep ? 'bg-red-500' : 'bg-gray-200'
                }`}
              />
            ))}
          </div>
        </div>

        <div className="py-4 min-h-[300px]">
          {!isReviewStep && currentOperation && (
            <OperationStepContent
              operation={currentOperation}
              config={configs[currentOperation]}
              onConfigChange={updateConfig}
            />
          )}

          {isReviewStep && (
            <ReviewStep
              selectedOps={selectedOps}
              configs={configs}
              estimatedTime={estimatedTime}
              estimatedCost={estimatedCost}
              onEditStep={handleEditStep}
            />
          )}
        </div>

        <div className="flex justify-between pt-4 border-t">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={currentStep === 0 || isStarting || isProcessing}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar
          </Button>

          <div className="flex gap-2">
            {!isReviewStep && (
              <Button variant="ghost" onClick={handleSkip} disabled={isStarting || isProcessing}>
                <SkipForward className="w-4 h-4 mr-2" />
                Pular
              </Button>
            )}

            {isReviewStep ? (
              <Button
                onClick={handleStartPipeline}
                disabled={selectedOps.size === 0 || isStarting}
                className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white"
              >
                {isStarting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Iniciando...
                  </>
                ) : (
                  <>
                    <Rocket className="w-4 h-4 mr-2" />
                    Iniciar Pipeline
                  </>
                )}
              </Button>
            ) : (
              <Button onClick={handleConfigure} disabled={isStarting || isProcessing}>
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processando...
                  </>
                ) : (
                  <>
                    Configurar & Avançar
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type ReviewStepProps = {
  selectedOps: Set<PipelineOperation>;
  configs: Partial<OperationConfigs>;
  estimatedTime: number;
  estimatedCost: number;
  onEditStep: (step: number) => void;
};

function ReviewStep({
  selectedOps,
  configs,
  estimatedTime,
  estimatedCost,
  onEditStep
}: ReviewStepProps) {
  if (selectedOps.size === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 mb-4">Nenhuma operação selecionada</p>
        <p className="text-sm text-gray-400">Volte e configure pelo menos uma operação</p>
      </div>
    );
  }

  const orderedSelectedOps = PIPELINE_OPERATIONS.filter((op) => selectedOps.has(op));

  return (
    <div className="space-y-4">
      <div className="p-4 border rounded-lg bg-green-50 dark:bg-green-900/20">
        <h3 className="font-semibold mb-2 text-gray-900 dark:text-gray-100">
          ✓ {selectedOps.size} Operações Selecionadas
        </h3>
        <div className="space-y-2">
          {orderedSelectedOps.map((op) => {
            const metadata = OPERATION_METADATA[op];
            const config = configs[op];
            const stepNumber = PIPELINE_OPERATIONS.indexOf(op);

            return (
              <div
                key={op}
                className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{metadata.icon}</span>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-gray-100">{metadata.name}</p>
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      {getConfigSummary(op, config)}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onEditStep(stepNumber)}
                  className="text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100"
                >
                  Editar
                </Button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="border rounded-lg p-4 bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700">
        <h3 className="font-semibold mb-3 text-gray-900 dark:text-gray-100">📊 Resumo do Pipeline</h3>
        <div className="space-y-2 text-sm">
          <p className="flex justify-between">
            <span className="text-gray-700 dark:text-gray-300">Tempo total estimado:</span>
            <span className="font-medium text-gray-900 dark:text-gray-100">
              ~{estimatedTime}-{estimatedTime + 5} min
            </span>
          </p>
          <p className="flex justify-between">
            <span className="text-gray-700 dark:text-gray-300">Custo total estimado:</span>
            <span className="font-medium text-gray-900 dark:text-gray-100">
              ${estimatedCost.toFixed(2)}
            </span>
          </p>
          <p className="flex justify-between">
            <span className="text-gray-700 dark:text-gray-300">Operações que requerem aprovação:</span>
            <span className="font-medium text-gray-900 dark:text-gray-100">
              {orderedSelectedOps.filter((op) => op === 'update' || op === 'improve').length}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
