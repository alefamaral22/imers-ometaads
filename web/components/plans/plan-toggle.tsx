'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * Ativar/desativar um plano (super_admin). PATCH /api/data/plans/:id com { isActive }. Soft-delete:
 * um plano desativado some do dropdown de novas contas, mas contas que já o usam continuam apontando.
 */
export function PlanToggle({ id, isActive }: { id: string; isActive: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function toggle() {
    setPending(true);
    setError(false);
    try {
      const res = await fetch(`/api/data/plans/${id}`, {
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
