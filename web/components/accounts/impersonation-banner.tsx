'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/** Banner fixo, sempre visível, enquanto o super_admin está em modo "visualizar como cliente". */
export function ImpersonationBanner({ targetSlug }: { targetSlug: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function stop() {
    setPending(true);
    try {
      await fetch('/api/data/impersonate/stop', { method: 'POST' });
      router.push('/accounts');
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="sticky top-0 z-30 flex items-center justify-center gap-3 bg-accent-2 px-4 py-2 text-xs font-medium text-bg">
      <span>
        Visualizando como <strong>{targetSlug}</strong> — somente leitura, nenhuma ação é salva.
      </span>
      <button
        type="button"
        onClick={stop}
        disabled={pending}
        className="rounded-md bg-bg/20 px-2 py-1 text-xs font-semibold hover:bg-bg/30 disabled:opacity-50"
      >
        {pending ? 'Saindo…' : 'Sair da visualização'}
      </button>
    </div>
  );
}
