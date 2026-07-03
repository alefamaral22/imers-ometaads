'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/** Inicia a visualização SOMENTE LEITURA como o cliente (super_admin, ADR/etapa super-admin-completo). */
export function ImpersonateButton({ accountId }: { accountId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function start() {
    setPending(true);
    try {
      const res = await fetch(`/api/data/accounts/${accountId}/impersonate`, { method: 'POST' });
      if (res.ok) {
        router.push('/');
        router.refresh();
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={start}
      disabled={pending}
      className="rounded-md bg-accent-2/15 px-3 py-1.5 text-xs font-medium text-accent-2 hover:bg-accent-2/25 disabled:opacity-50"
    >
      {pending ? 'Entrando…' : 'Visualizar como este cliente'}
    </button>
  );
}
