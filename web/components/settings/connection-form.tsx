'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

const ERRORS: Record<string, string> = {
  invalid_request: 'Dados inválidos. Confira a conta de anúncio e o token.',
  vault_unconfigured: 'Cofre desligado: configure AD_TOKEN_ENC_KEY/API_KEY_ENC_KEY no ambiente.',
  unauthorized: 'Sessão expirada. Entre novamente.',
};

const input =
  'mt-1 w-full rounded-md border border-edge/70 bg-bg/60 px-3 py-2 text-sm outline-none focus:border-accent';

export function ConnectionForm({
  accounts,
  disabled,
  fixedAccountId,
}: {
  accounts: { id: string; name: string }[];
  disabled: boolean;
  /** Quando presente, esconde o <select> de conta e usa este id fixo (ex.: /accounts/[id]). */
  fixedAccountId?: string;
}) {
  const router = useRouter();
  const [accountId, setAccountId] = useState(fixedAccountId ?? accounts[0]?.id ?? '');
  const [metaAdAccountId, setMetaAdAccountId] = useState('');
  const [token, setToken] = useState('');
  const [tokenLabel, setTokenLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setOkMsg(null);
    try {
      const res = await fetch('/api/data/connections', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          accountId,
          metaAdAccountId,
          token,
          ...(tokenLabel ? { tokenLabel } : {}),
        }),
      });
      if (res.ok) {
        setToken('');
        setMetaAdAccountId('');
        setTokenLabel('');
        setOkMsg('Conexão salva. O token foi cifrado; será validado no próximo ciclo.');
        router.refresh();
        return;
      }
      const body: unknown = await res.json().catch(() => null);
      const code =
        body && typeof body === 'object' && 'error' in body
          ? String(body.error)
          : 'invalid_request';
      setError(ERRORS[code] ?? 'Não foi possível salvar a conexão.');
    } catch {
      setError('Falha de rede.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mb-4 grid gap-3 rounded-xl border border-edge/60 bg-panel/40 p-4 sm:grid-cols-2"
    >
      {fixedAccountId ? null : (
        <div>
          <label className="block text-xs text-dim">Conta</label>
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className={input}
            disabled={disabled}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div>
        <label className="block text-xs text-dim">Conta de anúncio (act_…)</label>
        <input
          value={metaAdAccountId}
          onChange={(e) => setMetaAdAccountId(e.target.value)}
          placeholder="act_123456789"
          className={input}
          disabled={disabled}
          required
        />
      </div>
      <div>
        <label className="block text-xs text-dim">System User token</label>
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          autoComplete="off"
          className={input}
          disabled={disabled}
          required
        />
      </div>
      <div>
        <label className="block text-xs text-dim">Rótulo (opcional)</label>
        <input
          value={tokenLabel}
          onChange={(e) => setTokenLabel(e.target.value)}
          placeholder="System User — João"
          className={input}
          disabled={disabled}
        />
      </div>
      <div className="sm:col-span-2">
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {okMsg ? <p className="text-sm text-pos">{okMsg}</p> : null}
        <button
          type="submit"
          disabled={disabled || pending || token.length < 20 || metaAdAccountId.length === 0}
          className="mt-2 rounded-md bg-accent px-3 py-2 text-sm font-medium text-bg hover:bg-accent/80 disabled:opacity-50"
        >
          {pending ? 'Salvando…' : 'Conectar conta Meta'}
        </button>
      </div>
    </form>
  );
}
