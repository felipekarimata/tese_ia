'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { buildCommandCatalog } from '@/lib/agent/command-reference';
import { fetchAppSettings } from '@/components/settings/use-settings-form';
import { cn } from '@/lib/utils';
import { ArrowLeft, Copy, Check, Search, Sparkles, Terminal } from 'lucide-react';
import { toast } from 'sonner';

type CommandsCatalogProps = {
  backHref?: string;
  backLabel?: string;
  onUseCommand?: (cmd: string) => void;
  compact?: boolean;
};

export function CommandsCatalog({
  backHref = '/',
  backLabel = 'Voltar',
  onUseCommand,
  compact,
}: CommandsCatalogProps) {
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [catalog, setCatalog] = useState(buildCommandCatalog());

  useEffect(() => {
    fetchAppSettings().then((s) => {
      if (s?.skills) setCatalog(buildCommandCatalog(s.skills));
    });
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? catalog.map((cat) => ({
        ...cat,
        examples: cat.examples.filter(
          (ex) =>
            ex.cmd.toLowerCase().includes(q) ||
            ex.desc.toLowerCase().includes(q) ||
            cat.title.toLowerCase().includes(q)
        ),
      })).filter((cat) => cat.examples.length > 0)
    : catalog;

  const copyCmd = async (cmd: string) => {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopied(cmd);
      toast.success('Comando copiado');
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error('Não foi possível copiar');
    }
  };

  return (
    <div className={cn('space-y-8', compact ? 'space-y-6' : '')}>
      {!compact && (
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Terminal className="h-6 w-6 text-red-400" />
              <h1 className="text-2xl font-bold text-white">Comandos do Agente</h1>
            </div>
            <p className="text-sm text-gray-400 max-w-2xl leading-relaxed">
              Referência completa dos comandos slash no Modo Agente. Digite no chat ou copie os exemplos abaixo.
            </p>
          </div>
          <Link href={backHref}>
            <Button variant="outline" className="border-white/15 text-gray-300 gap-2">
              <ArrowLeft className="h-4 w-4" />
              {backLabel}
            </Button>
          </Link>
        </div>
      )}

      {!compact && (
        <div className="relative max-w-xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar comando..."
            className="pl-10 bg-white/5 border-white/10"
          />
        </div>
      )}

      <div className="space-y-6">
        {filtered.map((cat) => (
          <section
            key={cat.id}
            className="rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-white/10">
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-red-400" />
                {cat.title}
              </h2>
              <p className="text-sm text-gray-500 mt-1">{cat.description}</p>
            </div>
            <ul className="divide-y divide-white/5">
              {cat.examples.map((ex, idx) => (
                <li
                  key={`${cat.id}-${ex.cmd}-${idx}`}
                  className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-5 py-3.5 hover:bg-white/[0.03] transition"
                >
                  <code className="text-sm font-mono text-indigo-300 shrink-0">{ex.cmd}</code>
                  <span className="text-sm text-gray-500 sm:flex-1">{ex.desc}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    {onUseCommand && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 text-xs text-gray-400 hover:text-white"
                        onClick={() => onUseCommand(ex.cmd)}
                      >
                        Usar
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs border-white/10 gap-1.5"
                      onClick={() => copyCmd(ex.cmd)}
                    >
                      {copied === ex.cmd ? (
                        <Check className="h-3.5 w-3.5 text-green-400" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      Copiar
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="text-center text-gray-500 py-12">Nenhum comando encontrado para &quot;{query}&quot;</p>
      )}

      {!compact && (
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4 text-sm text-gray-500 space-y-2">
          <p className="font-medium text-gray-400">Dicas rápidas</p>
          <ul className="list-disc list-inside space-y-1 text-xs">
            <li>Digite <Badge variant="outline" className="text-[10px] mx-1">/</Badge> no chat para ver autocomplete</li>
            <li>Enter envia · Shift+Enter quebra linha</li>
            <li>Comandos individuais usam o provedor e o modelo selecionados no agente</li>
            <li><code className="text-red-300">/todos</code> usa os três candidatos e o juiz definidos em Configurações</li>
          </ul>
        </div>
      )}
    </div>
  );
}
