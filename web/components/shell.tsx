import type { ReactNode } from 'react';
import Link from 'next/link';
import { LogoutButton } from './logout-button';
import { NexusWidget } from './nexus/nexus-widget';
import { readSession } from '../lib/auth/server';

const ROLE_LABEL: Record<string, string> = {
  super_admin: 'agência',
  socio: 'sócio',
  cliente_usuario: 'cliente',
};

const NAV = [
  { href: '/', label: 'Visão geral' },
  { href: '/analyses', label: 'Análises' },
  { href: '/funnel', label: 'Funil' },
  { href: '/landing-pages', label: 'Landing pages' },
  { href: '/settings', label: 'Conexões & chaves' },
] as const;

// Onda 14 — "Contas" só para papéis de visibilidade global (a agência e seus sócios).
const ACCOUNTS_NAV = { href: '/accounts', label: 'Contas' } as const;

/** Authenticated dashboard chrome: top nav + content container. Server component. */
export async function Shell({ children }: { children: ReactNode }) {
  const session = await readSession();
  const canSeeAccounts = session?.role === 'super_admin' || session?.role === 'socio';
  const nav = canSeeAccounts ? [...NAV, ACCOUNTS_NAV] : NAV;
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <nav className="border-b border-neutral-800 bg-neutral-900/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-6">
            <Link href="/" className="text-sm font-semibold tracking-tight text-neutral-50">
              Acme · Nexus
            </Link>
            <div className="flex gap-4">
              {nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-sm text-neutral-400 hover:text-neutral-100"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {session ? (
              <span className="text-xs text-neutral-400">
                {session.slug}
                <span className="ml-1 rounded bg-neutral-800 px-1.5 py-0.5 text-neutral-300">
                  {ROLE_LABEL[session.role] ?? session.role}
                </span>
              </span>
            ) : null}
            <LogoutButton />
          </div>
        </div>
      </nav>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      <NexusWidget />
    </div>
  );
}
