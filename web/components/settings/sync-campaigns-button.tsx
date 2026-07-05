'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

const ERRORS: Record<string, string> = {
  client_required: 'Vincule esta conexão a um cliente antes de sincronizar.',
  client_ambiguous:
    'A conta tem mais de um cliente — vincule esta conexão a um cliente específico.',
  auth_error: 'Token inválido ou revogado. Edite a conexão com um token novo.',
  not_found: 'Conexão não encontrada.',
  forbidden: 'Sem permissão para sincronizar esta conexão.',
  sync_failed: 'Não foi possível ler as campanhas agora.',
};

/** Lê campanhas já existentes na Meta e importa para o painel (ADR 0036). Read-only, síncrono. */
export function SyncCampaignsButton({ connectionId }: { connectionId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  async function onSync() {
    setPending(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/data/connections/${connectionId}/sync-campaigns`, {
        method: 'POST',
      });
      const body: unknown = await res.json().catch(() => null);
      if (res.ok && body && typeof body === 'object' && 'imported' in body) {
        setMessage({ text: `${String(body.imported)} campanha(s) importada(s).`, ok: true });
        router.refresh();
        return;
      }
      const code =
        body && typeof body === 'object' && 'error' in body ? String(body.error) : 'sync_failed';
      setMessage({ text: ERRORS[code] ?? 'Não foi possível sincronizar.', ok: false });
    } catch {
      setMessage({ text: 'Falha de rede.', ok: false });
    } finally {
      setPending(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={onSync}
        disabled={pending}
        className="rounded-md px-2 py-1 text-[11px] text-accent hover:bg-accent/10 disabled:opacity-50"
      >
        {pending ? 'Sincronizando…' : 'Sincronizar campanhas'}
      </button>
      {message ? (
        <span className={`text-[11px] ${message.ok ? 'text-pos' : 'text-danger'}`}>
          {message.text}
        </span>
      ) : null}
    </span>
  );
}
