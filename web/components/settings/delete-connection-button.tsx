'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/** Apaga uma conexão Meta. Confirmação em dois cliques — reversível (basta reconectar). */
export function DeleteConnectionButton({ connectionId }: { connectionId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onConfirm() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/data/connections/${connectionId}`, { method: 'DELETE' });
      if (res.ok) {
        router.refresh();
        return;
      }
      setError('Não foi possível apagar.');
    } catch {
      setError('Falha de rede.');
    } finally {
      setPending(false);
      setConfirming(false);
    }
  }

  if (error) {
    return <span className="text-xs text-danger">{error}</span>;
  }

  if (confirming) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <button
          type="button"
          onClick={onConfirm}
          disabled={pending}
          className="rounded-md bg-danger px-2 py-1 text-[11px] font-medium text-bg hover:bg-danger/80 disabled:opacity-50"
        >
          {pending ? 'Apagando…' : 'Confirmar'}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="text-[11px] text-dim hover:text-ink/80"
        >
          Cancelar
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="rounded-md px-2 py-1 text-[11px] text-danger hover:bg-danger/10"
    >
      Apagar
    </button>
  );
}
