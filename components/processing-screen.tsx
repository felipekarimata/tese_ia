'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Trilho + preenchimento alinhados ao tema (reutilizar no pipeline). */
export function ProcessingProgressBar({
  value,
  className,
  trackClassName
}: {
  value: number;
  className?: string;
  trackClassName?: string;
}) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div className={cn('w-full', className)}>
      <div
        className={cn(
          'relative h-2.5 w-full overflow-hidden rounded-full bg-white/10',
          trackClassName
        )}
      >
      <div
        className="h-full rounded-full bg-gradient-to-r from-red-600 to-red-700 transition-all duration-500 ease-out"
        style={{ width: `${pct}%` }}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      />
      </div>
    </div>
  );
}

export type ProcessingScreenProps = {
  backHref: string;
  backLabel?: string;
  title: string;
  subtitle?: string;
  percent: number;
  statusLine?: string;
  detailLine?: string;
  icon?: ReactNode;
  children?: ReactNode;
};

export function ProcessingScreen({
  backHref,
  backLabel = 'Voltar',
  title,
  subtitle,
  percent,
  statusLine = 'A processar o seu pedido…',
  detailLine,
  icon,
  children
}: ProcessingScreenProps) {
  return (
    <div className="relative min-h-[70vh] flex flex-col">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[420px] h-[420px] bg-red-500/8 rounded-full blur-[100px]" />
        <div className="absolute bottom-1/4 right-0 w-[280px] h-[280px] bg-red-600/5 rounded-full blur-[80px]" />
      </div>

      <div className="flex items-center gap-3 mb-8 shrink-0">
        <Button variant="outline" size="icon" asChild className="border-white/10 bg-white/5 hover:bg-white/10">
          <Link href={backHref} aria-label={backLabel}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <span className="text-sm text-muted-foreground">{backLabel}</span>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-4 pb-12">
        <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-8 md:p-10 shadow-2xl shadow-black/40">
          <div className="flex flex-col items-center text-center space-y-6">
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-red-500/20 blur-xl scale-150 animate-pulse" />
              <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
                {icon ?? <Loader2 className="h-9 w-9 text-red-500 animate-spin" />}
              </div>
            </div>

            <div className="space-y-2">
              <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-white">{title}</h1>
              {subtitle ? (
                <p className="text-sm md:text-base text-muted-foreground">{subtitle}</p>
              ) : null}
            </div>

            <div className="w-full space-y-3 pt-2">
              <div className="flex justify-between text-sm gap-4">
                <span className="text-muted-foreground text-left">{statusLine}</span>
                <span className="tabular-nums font-medium text-white shrink-0">{Math.round(percent)}%</span>
              </div>
              <ProcessingProgressBar value={percent} />
              {detailLine ? (
                <p className="text-xs text-muted-foreground text-center pt-1">{detailLine}</p>
              ) : null}
            </div>

            {children ? <div className="w-full pt-4 border-t border-white/10">{children}</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
