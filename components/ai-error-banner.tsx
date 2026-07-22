'use client';

import Link from 'next/link';
import { AlertTriangle, CreditCard, Clock, KeyRound, Settings, ExternalLink } from 'lucide-react';
import { classifyAIError, type AIErrorInfo } from '@/lib/ai-error-message';
import { cn } from '@/lib/utils';

type AIErrorBannerProps = {
  error: string | unknown;
  /** Compact = inline message (smaller); Full = standalone banner */
  variant?: 'compact' | 'full';
  className?: string;
  /** Show "Ir para Configurações" link */
  showSettingsLink?: boolean;
};

const KIND_STYLES: Record<AIErrorInfo['kind'], { bg: string; border: string; text: string; iconText: string; icon: React.ReactNode }> = {
  quota: {
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
    text: 'text-red-200',
    iconText: 'text-red-400',
    icon: <CreditCard className="h-4 w-4" />,
  },
  'rate-limit': {
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    text: 'text-amber-200',
    iconText: 'text-amber-400',
    icon: <Clock className="h-4 w-4" />,
  },
  auth: {
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/30',
    text: 'text-orange-200',
    iconText: 'text-orange-400',
    icon: <KeyRound className="h-4 w-4" />,
  },
  unknown: {
    bg: 'bg-gray-500/10',
    border: 'border-gray-500/30',
    text: 'text-gray-200',
    iconText: 'text-gray-400',
    icon: <AlertTriangle className="h-4 w-4" />,
  },
};

export function AIErrorBanner({ error, variant = 'full', className, showSettingsLink = true }: AIErrorBannerProps) {
  const info = classifyAIError(error);
  const styles = KIND_STYLES[info.kind];

  if (variant === 'compact') {
    return (
      <div className={cn('flex items-start gap-2 px-3 py-2 rounded-md border text-xs', styles.bg, styles.border, styles.text, className)}>
        <span className={cn('flex-shrink-0 mt-0.5', styles.iconText)}>{styles.icon}</span>
        <div className="min-w-0">
          <p className="font-semibold">{info.title}</p>
          <p className="opacity-90 mt-0.5 leading-relaxed">{info.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('rounded-xl border p-4', styles.bg, styles.border, className)}>
      <div className="flex items-start gap-3">
        <div className={cn('p-2 rounded-lg bg-black/20 flex-shrink-0', styles.iconText)}>{styles.icon}</div>
        <div className="flex-1 min-w-0 space-y-2">
          <p className={cn('font-semibold text-sm', styles.text)}>{info.title}</p>
          <p className={cn('text-sm leading-relaxed opacity-90', styles.text)}>{info.message}</p>
          {info.hint && (
            <p className={cn('text-xs opacity-70', styles.text)}>{info.hint}</p>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            {showSettingsLink && (
              <Link
                href="/settings"
                className={cn(
                  'inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border transition-colors',
                  styles.border,
                  styles.text,
                  'hover:bg-black/30'
                )}
              >
                <Settings className="h-3 w-3" />
                Ir para Configurações
              </Link>
            )}

            {info.kind === 'quota' && info.provider === 'OpenAI' && (
              <a
                href="https://platform.openai.com/account/billing/overview"
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  'inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border transition-colors',
                  styles.border,
                  styles.text,
                  'hover:bg-black/30'
                )}
              >
                <ExternalLink className="h-3 w-3" />
                Painel OpenAI
              </a>
            )}

            {info.kind === 'quota' && info.provider === 'Google Gemini' && (
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  'inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border transition-colors',
                  styles.border,
                  styles.text,
                  'hover:bg-black/30'
                )}
              >
                <ExternalLink className="h-3 w-3" />
                Painel Google
              </a>
            )}

            {info.kind === 'quota' && info.provider === 'Anthropic Claude' && (
              <a
                href="https://console.anthropic.com/settings/plans"
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  'inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border transition-colors',
                  styles.border,
                  styles.text,
                  'hover:bg-black/30'
                )}
              >
                <ExternalLink className="h-3 w-3" />
                Painel Anthropic
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
