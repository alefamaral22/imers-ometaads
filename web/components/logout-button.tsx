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
      className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
    >
      {pending ? 'Saindo…' : 'Sair'}
    </button>
  );
}
