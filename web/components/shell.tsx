import type { ReactNode } from 'react';
import Link from 'next/link';
import { LogoutButton } from './logout-button';
import { NexusWidget } from './nexus/nexus-widget';

const NAV = [
  { href: '/', label: 'Visão geral' },
  { href: '/analyses', label: 'Análises' },
  { href: '/funnel', label: 'Funil' },
  { href: '/landing-pages', label: 'Landing pages' },
] as const;

/** Authenticated dashboard chrome: top nav + content container. Server component. */
export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <nav className="border-b border-neutral-800 bg-neutral-900/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-6">
            <Link href="/" className="text-sm font-semibold tracking-tight text-neutral-50">
              Acme · Nexus
            </Link>
            <div className="flex gap-4">
              {NAV.map((item) => (
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
          <LogoutButton />
        </div>
      </nav>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      <NexusWidget />
    </div>
  );
}
