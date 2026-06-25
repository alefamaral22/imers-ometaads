'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * Botão de ativar/desativar uma account (super_admin). PATCH /api/data/accounts/:id. O servidor barra
 * desativar a si mesmo ou um super_admin (canToggleAccount) — aqui esses casos nem renderizam o botão.
 */
export function AccountToggle({ id, isActive }: { id: string; isActive: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function toggle() {
    setPending(true);
    setError(false);
    try {
      const res = await fetch(`/api/data/accounts/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ isActive: !isActive }),
      });
      if (res.ok) {
        router.refresh();
        return;
      }
      setError(true);
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      className={`rounded-md px-2.5 py-1 text-xs font-medium disabled:opacity-50 ${
        isActive
          ? 'bg-danger/15 text-danger hover:bg-danger/25'
          : 'bg-pos/15 text-pos hover:bg-pos/25'
      }`}
      title={error ? 'Falhou — tente novamente' : undefined}
    >
      {pending ? '…' : isActive ? 'Desativar' : 'Reativar'}
    </button>
  );
}
