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
    <main className="relative z-10 flex min-h-screen items-center justify-center px-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-xl border border-accent/25 bg-panel/80 p-8 backdrop-blur-md panel-glow"
      >
        <span aria-hidden className="mx-auto mb-5 block reactor h-12 w-12" />
        <p className="text-center text-[9px] tracking-[0.32em] text-dim uppercase">
          Neural · Core · System
        </p>
        <h1 className="mt-1 text-center text-lg font-bold tracking-[0.18em] text-ink uppercase">
          Acme <span className="text-accent text-glow">· Trafegante</span>
        </h1>
        <p className="mt-1 text-center text-xs text-dim">Acesso por conta. Restrito.</p>

        <label
          htmlFor="email"
          className="mt-6 block text-[10px] tracking-[0.16em] text-dim uppercase"
        >
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="mt-1 w-full rounded-md border border-edge/70 bg-bg/60 px-3 py-2 text-sm text-ink outline-none focus:border-accent"
        />

        <label
          htmlFor="password"
          className="mt-4 block text-[10px] tracking-[0.16em] text-dim uppercase"
        >
          Senha
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="mt-1 w-full rounded-md border border-edge/70 bg-bg/60 px-3 py-2 text-sm text-ink outline-none focus:border-accent"
        />

        {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}

        <button
          type="submit"
          disabled={pending || email.length === 0 || password.length === 0}
          className="mt-6 w-full rounded-md border border-accent/50 bg-accent/15 px-3 py-2 text-[11px] font-semibold tracking-[0.16em] text-accent uppercase transition-colors hover:bg-accent/25 disabled:opacity-50"
        >
          {pending ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </main>
  );
}
