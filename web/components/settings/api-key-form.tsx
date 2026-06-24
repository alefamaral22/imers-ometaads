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
  'mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-sky-500';

export function ApiKeyForm({
  accounts,
  disabled,
}: {
  accounts: { id: string; name: string }[];
  disabled: boolean;
}) {
  const router = useRouter();
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
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
        setKey('');
        setLabel('');
        setOkMsg('Chave salva (cifrada). Substitui a anterior do mesmo provedor.');
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
      className="mb-4 grid gap-3 rounded-xl border border-neutral-800 bg-neutral-900/40 p-4 sm:grid-cols-2"
    >
      <div>
        <label className="block text-xs text-neutral-400">Conta</label>
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
      <div>
        <label className="block text-xs text-neutral-400">Provedor</label>
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
        <label className="block text-xs text-neutral-400">Chave</label>
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
        <label className="block text-xs text-neutral-400">Rótulo (opcional)</label>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className={input}
          disabled={disabled}
        />
      </div>
      <div className="sm:col-span-2">
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        {okMsg ? <p className="text-sm text-emerald-400">{okMsg}</p> : null}
        <button
          type="submit"
          disabled={disabled || pending || key.length < 10}
          className="mt-2 rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
        >
          {pending ? 'Salvando…' : 'Salvar chave'}
        </button>
      </div>
    </form>
  );
}
