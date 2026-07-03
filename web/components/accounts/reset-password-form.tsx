'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

const ERRORS: Record<string, string> = {
  invalid_request: 'Senha inválida (mín. 8 caracteres).',
  forbidden: 'Sem permissão para redefinir esta senha.',
  not_found: 'Conta não encontrada.',
  unauthorized: 'Sessão expirada. Entre novamente.',
};

const input =
  'mt-1 w-full rounded-md border border-edge/70 bg-bg/60 px-3 py-2 text-sm outline-none focus:border-accent';

export function ResetPasswordForm({ accountId }: { accountId: string }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setOkMsg(null);
    try {
      const res = await fetch(`/api/data/accounts/${accountId}/password`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        setPassword('');
        setOkMsg('Senha redefinida. O cliente foi notificado por e-mail (se configurado).');
        router.refresh();
        return;
      }
      const body: unknown = await res.json().catch(() => null);
      const code =
        body && typeof body === 'object' && 'error' in body
          ? String(body.error)
          : 'invalid_request';
      setError(ERRORS[code] ?? 'Não foi possível redefinir a senha.');
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
      <div className="sm:col-span-2">
        <label className="block text-xs text-dim">Nova senha (mín. 8)</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={input}
          autoComplete="new-password"
          required
        />
      </div>
      <div className="sm:col-span-2">
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {okMsg ? <p className="text-sm text-pos">{okMsg}</p> : null}
        <button
          type="submit"
          disabled={pending || password.length < 8}
          className="mt-2 rounded-md bg-accent px-3 py-2 text-sm font-medium text-bg hover:bg-accent/80 disabled:opacity-50"
        >
          {pending ? 'Salvando…' : 'Redefinir senha'}
        </button>
      </div>
    </form>
  );
}
