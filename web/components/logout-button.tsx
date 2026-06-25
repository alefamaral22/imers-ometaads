'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/** Logs the operator out by clearing the session cookie via the API, then returns to /login. */
export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function logout() {
    setPending(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.replace('/login');
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={logout}
      disabled={pending}
      className="rounded-md border border-edge/70 px-3 py-1.5 text-[11px] tracking-wider text-dim uppercase transition-colors hover:border-danger/50 hover:text-danger disabled:opacity-50"
    >
      {pending ? 'Saindo…' : 'Sair'}
    </button>
  );
}
