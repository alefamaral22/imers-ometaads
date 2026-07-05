'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import type { ConnectionDisplay } from '../../lib/domain/schemas';

const ERRORS: Record<string, string> = {
  invalid_request: 'Dados inválidos. Confira a conta de anúncio.',
  vault_unconfigured: 'Cofre desligado: configure AD_TOKEN_ENC_KEY/API_KEY_ENC_KEY no ambiente.',
  unauthorized: 'Sessão expirada. Entre novamente.',
  not_found: 'Conexão não encontrada.',
  forbidden: 'Sem permissão para editar esta conexão.',
};

const input =
  'mt-1 w-full rounded-md border border-edge/70 bg-bg/60 px-3 py-2 text-sm outline-none focus:border-accent';

/** Editar conexão: reabre um formulário preenchido. Token vem em branco — só re-envia se digitado. */
export function EditConnectionButton({
  connection,
  clients,
}: {
  connection: ConnectionDisplay;
  clients: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [metaAdAccountId, setMetaAdAccountId] = useState(connection.meta_ad_account_id);
  const [token, setToken] = useState('');
  const [tokenLabel, setTokenLabel] = useState(connection.token_label ?? '');
  const [clientId, setClientId] = useState(connection.client_id ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/data/connections/${connection.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          metaAdAccountId,
          tokenLabel: tokenLabel || null,
          clientId: clientId || null,
          ...(token ? { token } : {}),
        }),
      });
      if (res.ok) {
        setOpen(false);
        setToken('');
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
      setPending(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md px-2 py-1 text-[11px] text-accent hover:bg-accent/10"
      >
        Editar
      </button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mt-2 grid gap-3 rounded-xl border border-accent/40 bg-panel/40 p-4 sm:grid-cols-2"
    >
      <div>
        <label className="block text-xs text-dim">Conta de anúncio (act_…)</label>
        <input
          value={metaAdAccountId}
          onChange={(e) => setMetaAdAccountId(e.target.value)}
          className={input}
          required
        />
      </div>
      <div>
        <label className="block text-xs text-dim">Rótulo</label>
        <input
          value={tokenLabel}
          onChange={(e) => setTokenLabel(e.target.value)}
          className={input}
        />
      </div>
      <div className="sm:col-span-2">
        <label className="block text-xs text-dim">Cliente (dono das campanhas sincronizadas)</label>
        <select
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          className={input}
          disabled={clients.length === 0}
        >
          <option value="">— sem cliente vinculado —</option>
          {clients.map((cl) => (
            <option key={cl.id} value={cl.id}>
              {cl.name}
            </option>
          ))}
        </select>
        {clients.length === 0 ? (
          <p className="mt-1 text-[11px] text-dim">
            Nenhum cliente cadastrado nesta conta ainda. Cadastre um cliente para poder vincular.
          </p>
        ) : null}
      </div>
      <div className="sm:col-span-2">
        <label className="block text-xs text-dim">
          Novo System User token (deixe em branco para manter o atual)
        </label>
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          autoComplete="off"
          className={input}
        />
      </div>
      <div className="sm:col-span-2">
        {error ? <p className="mb-2 text-sm text-danger">{error}</p> : null}
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={
              pending || metaAdAccountId.length === 0 || (token.length > 0 && token.length < 20)
            }
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-bg hover:bg-accent/80 disabled:opacity-50"
          >
            {pending ? 'Salvando…' : 'Salvar'}
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setToken('');
              setError(null);
            }}
            className="text-xs text-dim hover:text-ink/80"
          >
            Cancelar
          </button>
        </div>
      </div>
    </form>
  );
}
