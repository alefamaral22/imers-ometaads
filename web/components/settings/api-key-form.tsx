'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

const ERRORS: Record<string, string> = {
  invalid_request: 'Dados inválidos. Confira o provedor e a chave.',
  vault_unconfigured: 'Cofre desligado: configure AD_TOKEN_ENC_KEY/API_KEY_ENC_KEY no ambiente.',
  unauthorized: 'Sessão expirada. Entre novamente.',
};

const PROVIDERS = ['anthropic', 'openai', 'elevenlabs', 'minimax', 'other'] as const;

const input =
  'mt-1 w-full rounded-md border border-edge/70 bg-bg/60 px-3 py-2 text-sm outline-none focus:border-accent';

export function ApiKeyForm({
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
  const [provider, setProvider] = useState<(typeof PROVIDERS)[number]>('anthropic');
  const [key, setKey] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setOkMsg(null);
    try {
      const res = await fetch('/api/data/api-keys', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accountId, provider, key, ...(label ? { label } : {}) }),
      });
      if (res.ok) {
        const saved: unknown = await res.json().catch(() => null);
        const status =
          saved && typeof saved === 'object' && 'apiKey' in saved
            ? (saved.apiKey as { status?: string }).status
            : undefined;
        setKey('');
        setLabel('');
        setOkMsg(
          status === 'active'
            ? '✓ Conectado — chave salva (cifrada) e validada.'
            : status === 'invalid'
              ? '✗ Chave inválida — salva, mas o provedor recusou. Confira e salve de novo.'
              : 'Chave salva (cifrada). Não foi possível validar agora — status: não verificada.',
        );
        router.refresh();
        return;
      }
      const body: unknown = await res.json().catch(() => null);
      const code =
        body && typeof body === 'object' && 'error' in body
          ? String(body.error)
          : 'invalid_request';
      setError(ERRORS[code] ?? 'Não foi possível salvar a chave.');
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
        <label className="block text-xs text-dim">Provedor</label>
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value as (typeof PROVIDERS)[number])}
          className={input}
          disabled={disabled}
        >
          {PROVIDERS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs text-dim">Chave</label>
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          autoComplete="off"
          className={input}
          disabled={disabled}
          required
        />
      </div>
      <div>
        <label className="block text-xs text-dim">Rótulo (opcional)</label>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className={input}
          disabled={disabled}
        />
      </div>
      <div className="sm:col-span-2">
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {okMsg ? <p className="text-sm text-pos">{okMsg}</p> : null}
        <button
          type="submit"
          disabled={disabled || pending || key.length < 10}
          className="mt-2 rounded-md bg-accent px-3 py-2 text-sm font-medium text-bg hover:bg-accent/80 disabled:opacity-50"
        >
          {pending ? 'Salvando…' : 'Salvar chave'}
        </button>
      </div>
    </form>
  );
}
