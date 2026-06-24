import type { ReactNode } from 'react';

/**
 * Minimal shadcn-style primitives (Tailwind). Kept dependency-free for the dashboard slice;
 * a future wave can swap these for the full shadcn/ui registry without changing call sites.
 */

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-neutral-800 bg-neutral-900/60 p-5 ${className}`}>
      {children}
    </div>
  );
}

export function CardTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="mb-3 text-sm font-medium tracking-wide text-neutral-400 uppercase">
      {children}
    </h3>
  );
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Card>
      <CardTitle>{label}</CardTitle>
      <p className="text-2xl font-semibold text-neutral-50">{value}</p>
    </Card>
  );
}

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
  PAUSED: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
  ARCHIVED: 'bg-neutral-500/15 text-neutral-300 ring-neutral-500/30',
  DELETED: 'bg-red-500/15 text-red-300 ring-red-500/30',
  healthy: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
  watch: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
  underperforming: 'bg-red-500/15 text-red-300 ring-red-500/30',
  learning: 'bg-sky-500/15 text-sky-300 ring-sky-500/30',
  no_data: 'bg-neutral-500/15 text-neutral-300 ring-neutral-500/30',
  error: 'bg-red-500/15 text-red-300 ring-red-500/30',
  deployed: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
  draft: 'bg-neutral-500/15 text-neutral-300 ring-neutral-500/30',
  building: 'bg-sky-500/15 text-sky-300 ring-sky-500/30',
  failed: 'bg-red-500/15 text-red-300 ring-red-500/30',
  ativa: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
  inativa: 'bg-red-500/15 text-red-300 ring-red-500/30',
};

export function Badge({ value }: { value: string }) {
  const style = STATUS_STYLES[value] ?? 'bg-neutral-500/15 text-neutral-300 ring-neutral-500/30';
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ring-1 ring-inset ${style}`}
    >
      {value}
    </span>
  );
}

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-neutral-800">
      <table className="w-full text-left text-sm">{children}</table>
    </div>
  );
}

export function Th({ children }: { children: ReactNode }) {
  return (
    <th className="border-b border-neutral-800 bg-neutral-900/80 px-4 py-2 font-medium text-neutral-400">
      {children}
    </th>
  );
}

export function Td({ children }: { children: ReactNode }) {
  return <td className="border-b border-neutral-900 px-4 py-2 text-neutral-200">{children}</td>;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <Card className="text-center text-sm text-neutral-400">{children}</Card>;
}

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="mb-6">
      <h1 className="text-2xl font-semibold text-neutral-50">{title}</h1>
      {subtitle ? <p className="mt-1 text-sm text-neutral-400">{subtitle}</p> : null}
    </header>
  );
}
