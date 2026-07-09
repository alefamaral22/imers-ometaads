'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import type { ConnectionDisplay } from '../../lib/domain/schemas';

const ERRORS: Record<string, string> = {
  invalid_request: 'Dados inválidos.',
  vault_unconfigured: 'Cofre desligado: configure AD_TOKEN_ENC_KEY/API_KEY_ENC_KEY no ambiente.',
  unauthorized: 'Sessão expirada. Entre novamente.',
  not_found: 'Conexão não encontrada.',
  forbidden: 'Sem permissão para editar esta conexão.',
};

const select =
  'mt-1 w-full rounded-md border border-edge/70 bg-bg/60 px-3 py-2 text-sm outline-none focus:border-accent';

/**
 * Vincula/desvincula contas de anúncio Meta (ad_account_connections) a este cliente. É esse vínculo
 * que diz ao Trafegante (skills headless) qual conta usar pra analisar/criar campanhas — a escolha é
 * sempre explícita por cliente, nunca fallback implícito (CLAUDE.md). Escreve via
 * PATCH /api/data/connections/:id (mesma rota do formulário de edição em Settings).
 */
export function ClientAdAccounts({
  clientId,
  connections,
}: {
  clientId: string;
  connections: ConnectionDisplay[];
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [selected, setSelected] = useState('');
  const [error, setError] = useState<string | null>(null);

  const linked = connections.filter((c) => c.client_id === clientId);
  const available = connections.filter((c) => c.client_id !== clientId);

  async function setLink(connectionId: string, newClientId: string | null) {
    setPendingId(connectionId);
    setError(null);
    try {
      const res = await fetch(`/api/data/connections/${connectionId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clientId: newClientId }),
      });
      if (res.ok) {
        setSelected('');
        router.refresh();
        return;
      }
      const body: unknown = await res.json().catch(() => null);
      const code =
        body && typeof body === 'object' && 'error' in body
          ? String(body.error)
          : 'invalid_request';
      setError(ERRORS[code] ?? 'Não foi possível salvar.');
    } catch {
      setError('Falha de rede.');
    } finally {
      setPendingId(null);
    }
  }

  async function onLink(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    await setLink(selected, clientId);
  }

  if (connections.length === 0) {
    return (
      <p className="text-sm text-dim">
        Nenhuma conta de anúncio conectada nesta account ainda. Cadastre uma em{' '}
        <a href="/settings" className="text-accent hover:underline">
          Conexões &amp; chaves
        </a>{' '}
        e depois vincule aqui.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {linked.length === 0 ? (
        <p className="text-sm text-dim">
          Nenhuma conta de anúncio vinculada. O Trafegante não consegue analisar nem criar
          campanhas para este cliente até vincular ao menos uma.
        </p>
      ) : (
        <ul className="space-y-2 text-sm">
          {linked.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between gap-3 rounded-md border border-edge/70 bg-bg/40 px-3 py-2"
            >
              <span className="truncate text-ink/80">
                {c.token_label ?? c.meta_ad_account_id}{' '}
                <span className="text-dim">({c.meta_ad_account_id})</span>
              </span>
              <button
                type="button"
                disabled={pendingId === c.id}
                onClick={() => void setLink(c.id, null)}
                className="shrink-0 rounded-md px-2 py-1 text-[11px] text-danger hover:bg-danger/10 disabled:opacity-50"
              >
                {pendingId === c.id ? 'Removendo…' : 'Desvincular'}
              </button>
            </li>
          ))}
        </ul>
      )}

      {available.length > 0 ? (
        <form onSubmit={onLink} className="flex items-end gap-2">
          <div className="flex-1">
            <label className="block text-xs text-dim">Vincular outra conta de anúncio</label>
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className={select}
            >
              <option value="">— selecione —</option>
              {available.map((c) => (
                <option key={c.id} value={c.id}>
                  {(c.token_label ?? c.meta_ad_account_id) + ` (${c.meta_ad_account_id})`}
                  {c.client_id ? ' — vinculada a outro cliente' : ''}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={!selected || pendingId !== null}
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-bg hover:bg-accent/80 disabled:opacity-50"
          >
            Vincular
          </button>
        </form>
      ) : null}

      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
