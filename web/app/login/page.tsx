'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

const ERRORS: Record<string, string> = {
  invalid_credentials: 'Senha incorreta.',
  invalid_request: 'Requisição inválida.',
  too_many_requests: 'Muitas tentativas. Aguarde um instante.',
  turnstile_failed: 'Verificação anti-bot falhou.',
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        router.replace('/');
        router.refresh();
        return;
      }
      const body: unknown = await res.json().catch(() => null);
      const code =
        body && typeof body === 'object' && 'error' in body
          ? String(body.error)
          : 'invalid_request';
      setError(ERRORS[code] ?? 'Não foi possível entrar.');
    } catch {
      setError('Falha de rede.');
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-950 px-6 text-neutral-100">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-900/60 p-8"
      >
        <h1 className="text-lg font-semibold text-neutral-50">Acme · Nexus</h1>
        <p className="mt-1 text-sm text-neutral-400">Acesso por conta. Restrito.</p>

        <label htmlFor="email" className="mt-6 block text-sm text-neutral-300">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-sky-500"
        />

        <label htmlFor="password" className="mt-4 block text-sm text-neutral-300">
          Senha
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-sky-500"
        />

        {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}

        <button
          type="submit"
          disabled={pending || email.length === 0 || password.length === 0}
          className="mt-6 w-full rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
        >
          {pending ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </main>
  );
}
