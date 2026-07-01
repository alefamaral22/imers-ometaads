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

// Só para papéis de visibilidade global (a agência e seus sócios): cadastro de clientes e contas.
const AGENCY_NAV = [
  { href: '/clients', label: 'Clientes' },
  { href: '/accounts', label: 'Contas' },
] as const;

/** Authenticated dashboard chrome: top nav + content container. Server component. */
export async function Shell({ children }: { children: ReactNode }) {
  const session = await readSession();
  // Visibilidade global = a agência (super_admin/socio). Onda 14: menu Contas. Onda 15: o Nexus é
  // ferramenta da agência — o widget some para cliente_usuario (e a API /nexus/* também os barra).
  const isAgency = session?.role === 'super_admin' || session?.role === 'socio';
  const nav = isAgency ? [...NAV, ...AGENCY_NAV] : NAV;
  return (
    <div className="relative z-10 min-h-screen">
      <nav className="sticky top-0 z-20 border-b border-edge/60 bg-bg/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-6 py-3">
          <div className="flex items-center gap-6">
            <Link href="/" className="group flex items-center gap-2.5">
              <span aria-hidden className="reactor h-6 w-6 shrink-0" />
              <span className="flex flex-col leading-none">
                <span className="text-[8px] tracking-[0.32em] text-dim uppercase">
                  Neural · Core · System
                </span>
                <span className="mt-0.5 text-sm font-bold tracking-[0.18em] text-ink uppercase">
                  Acme <span className="text-accent text-glow">· Trafegante</span>
                </span>
              </span>
            </Link>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-1 text-[11px] tracking-[0.12em] text-dim uppercase transition-colors hover:text-accent"
                >
                  <span aria-hidden className="text-accent/40">
                    ▸
                  </span>
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            {session ? (
              <span className="flex items-center gap-1.5 text-[10px] tracking-wider uppercase">
                <span className="text-dim">{session.slug}</span>
                <span className="rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-accent">
                  {ROLE_LABEL[session.role] ?? session.role}
                </span>
              </span>
            ) : null}
            <LogoutButton />
          </div>
        </div>
      </nav>
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
      {isAgency ? <NexusWidget /> : null}
    </div>
  );
}
