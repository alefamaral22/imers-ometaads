'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

const ERRORS: Record<string, string> = {
  invalid_request: 'Dados inválidos. Confira slug, e-mail e senha (mín. 8).',
  conflict: 'Já existe uma conta com esse slug ou e-mail.',
  forbidden: 'Sem permissão para criar contas.',
  unauthorized: 'Sessão expirada. Entre novamente.',
};

const input =
  'mt-1 w-full rounded-md border border-edge/70 bg-bg/60 px-3 py-2 text-sm outline-none focus:border-accent';

const ROLES = [
  { value: 'cliente_usuario', label: 'Cliente' },
  { value: 'socio', label: 'Sócio' },
] as const;

export function AccountForm({ plans }: { plans: { slug: string; name: string }[] }) {
  const router = useRouter();
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<string>('cliente_usuario');
  const [plan, setPlan] = useState<string>(plans[0]?.slug ?? 'trial');
  const [email, setEmail] = useState('');
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
      const res = await fetch('/api/data/accounts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug, name, role, plan, email, password }),
      });
      if (res.ok) {
        setSlug('');
        setName('');
        setEmail('');
        setPassword('');
        setOkMsg('Conta criada. A senha foi cifrada (scrypt) — o cliente já pode entrar.');
        router.refresh();
        return;
      }
      const body: unknown = await res.json().catch(() => null);
      const code =
        body && typeof body === 'object' && 'error' in body
          ? String(body.error)
          : 'invalid_request';
      setError(ERRORS[code] ?? 'Não foi possível criar a conta.');
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
      <div>
        <label className="block text-xs text-dim">Slug</label>
        <input
          value={slug}
          onChange={(e) => setSlug(e.target.value.toLowerCase())}
          placeholder="cliente-x"
          className={input}
          required
        />
      </div>
      <div>
        <label className="block text-xs text-dim">Nome</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Cliente X Ltda."
          className={input}
          required
        />
      </div>
      <div>
        <label className="block text-xs text-dim">Papel</label>
        <select value={role} onChange={(e) => setRole(e.target.value)} className={input}>
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs text-dim">Plano</label>
        <select value={plan} onChange={(e) => setPlan(e.target.value)} className={input}>
          {plans.map((p) => (
            <option key={p.slug} value={p.slug}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs text-dim">E-mail de login</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="dono@cliente-x.com"
          className={input}
          autoComplete="off"
          required
        />
      </div>
      <div>
        <label className="block text-xs text-dim">Senha inicial (mín. 8)</label>
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
          disabled={pending || slug.length < 2 || password.length < 8 || email.length === 0}
          className="mt-2 rounded-md bg-accent px-3 py-2 text-sm font-medium text-bg hover:bg-accent/80 disabled:opacity-50"
        >
          {pending ? 'Criando…' : 'Criar conta'}
        </button>
      </div>
    </form>
  );
}
