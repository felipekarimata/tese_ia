'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { getAIErrorMessage } from '@/lib/ai-error-message';

type ImproveButtonProps = {
  documentId: string;
  documentTitle: string;
};

export function ImproveButton({ documentId, documentTitle }: ImproveButtonProps) {
  const router = useRouter();
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const handleImprove = async () => {
    if (isAnalyzing) return;

    try {
      setIsAnalyzing(true);
      toast.loading('Iniciando análise de melhorias...');

      const res = await fetch(`/api/improve/${documentId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'openai',
          model: 'gpt-5.4-mini'
        })
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Falha ao iniciar análise');
      }

      const data = await res.json();
      toast.dismiss();
      toast.success('Análise iniciada! Redirecionando...');

      // Redireciona para página de visualização
      setTimeout(() => {
        router.push(`/improvements/${data.jobId}`);
      }, 1000);

    } catch (error: any) {
      console.error('Improvement error:', error);
      toast.dismiss();
      toast.error(getAIErrorMessage(error, 'Falha ao iniciar análise'));
      setIsAnalyzing(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleImprove}
      disabled={isAnalyzing}
      suppressHydrationWarning
    >
      {isAnalyzing ? (
        <>
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          Analisando...
        </>
      ) : (
        <>
          <Sparkles className="w-4 h-4 mr-2" />
          Sugerir Melhorias
        </>
      )}
    </Button>
  );
}
