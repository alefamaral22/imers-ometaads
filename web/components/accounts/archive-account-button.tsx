'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * Arquivamento irreversível (soft, ADR 0030 mantém — nunca hard-delete). Exige digitar o slug da
 * conta para confirmar: uma ação sem volta não deve ser um único clique acidental.
 */
export function ArchiveAccountButton({ accountId, slug }: { accountId: string; slug: string }) {
  const router = useRouter();
  const [confirmText, setConfirmText] = useState('');
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onConfirm() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/data/accounts/${accountId}/archive`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      });
      if (res.ok) {
        router.push('/accounts');
        router.refresh();
        return;
      }
      setError('Não foi possível arquivar. Tente de novo.');
    } catch {
      setError('Falha de rede.');
    } finally {
      setPending(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md bg-danger/15 px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger/25"
      >
        Arquivar conta (irreversível)
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-danger/40 bg-danger/5 p-4">
      <p className="mb-2 text-sm text-ink/90">
        Isto arquiva a conta permanentemente e corta o login na hora. Não há como desarquivar pela
        UI. Digite <span className="font-mono text-danger">{slug}</span> para confirmar.
      </p>
      <div className="flex items-center gap-2">
        <input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          className="rounded-md border border-edge/70 bg-bg/60 px-3 py-1.5 text-sm outline-none focus:border-danger"
        />
        <button
          type="button"
          onClick={onConfirm}
          disabled={pending || confirmText !== slug}
          className="rounded-md bg-danger px-3 py-1.5 text-xs font-medium text-bg hover:bg-danger/80 disabled:opacity-50"
        >
          {pending ? 'Arquivando…' : 'Confirmar arquivamento'}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setConfirmText('');
            setError(null);
          }}
          className="text-xs text-dim hover:text-ink/80"
        >
          Cancelar
        </button>
      </div>
      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
    </div>
  );
}
