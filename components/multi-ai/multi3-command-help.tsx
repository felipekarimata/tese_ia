'use client';

import {
  MULTI3_COMMAND_EXAMPLES,
  MULTI3_PROVIDER_HINT,
  MULTI3_SHORT_DESCRIPTION,
} from '@/lib/agent/command-reference';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ExternalLink } from 'lucide-react';

type Multi3CommandHelpProps = {
  onPick: (cmd: string) => void;
  compact?: boolean;
};

export function Multi3CommandHelp({ onPick, compact }: Multi3CommandHelpProps) {
  return (
    <div className={compact ? 'space-y-3' : 'mt-4 pt-4 border-t border-white/10 space-y-4'}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium text-indigo-400 mb-1">`/todos` — 3 IAs + juiz</p>
          <p className="text-[11px] text-gray-500 leading-relaxed">{MULTI3_SHORT_DESCRIPTION}</p>
          <p className="text-[11px] text-gray-600 mt-1">Configuração: {MULTI3_PROVIDER_HINT}</p>
        </div>
        <Link href="/commands">
          <Button size="sm" variant="ghost" className="h-7 text-[10px] text-indigo-400 shrink-0 gap-1">
            <ExternalLink className="h-3 w-3" />
            Ver todos
          </Button>
        </Link>
      </div>
      <div className="space-y-0.5">
        {MULTI3_COMMAND_EXAMPLES.map((ex) => (
          <button
            key={ex.cmd}
            type="button"
            onClick={() => onPick(ex.cmd)}
            className="w-full flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-2 text-left text-xs px-2 py-1.5 rounded-md hover:bg-white/[0.06] transition"
          >
            <code className="text-indigo-300 font-mono shrink-0">{ex.cmd}</code>
            <span className="text-gray-500 sm:ml-auto sm:text-right">{ex.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export { MULTI3_SHORT_DESCRIPTION } from '@/lib/agent/command-reference';
