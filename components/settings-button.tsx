'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Settings } from 'lucide-react';

export function SettingsButton() {
  const pathname = usePathname();
  const active = pathname.startsWith('/settings');

  return (
    <Link
      href="/settings"
      className={`relative h-9 px-3 rounded-lg flex items-center gap-1.5 text-sm font-medium transition-all border ${
        active
          ? 'text-white bg-white/10 border-white/20'
          : 'text-gray-400 border-white/10 hover:text-white hover:bg-white/5'
      }`}
      title="Configurações"
    >
      <Settings className="h-4 w-4" />
      <span className="hidden sm:inline">Configurações</span>
    </Link>
  );
}
