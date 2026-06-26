import type { CSSProperties, ReactNode } from 'react';

/**
 * Primitivos do design system "Neural Core" (Tailwind v4 tokens em globals.css). Como toda página
 * compõe estes componentes, o tema premium se propaga pela plataforma inteira a partir daqui.
 */

export type Tone = 'accent' | 'accent2' | 'pos' | 'warn' | 'purple' | 'danger' | 'muted';

// Classes ESTÁTICAS por tom (Tailwind extrai por string literal — nada de interpolar nome de cor).
const TONE_TEXT: Record<Tone, string> = {
  accent: 'text-accent',
  accent2: 'text-accent-2',
  pos: 'text-pos',
  warn: 'text-warn',
  purple: 'text-purple',
  danger: 'text-danger',
  muted: 'text-dim',
};

const TONE_BAR: Record<Tone, string> = {
  accent: 'via-accent',
  accent2: 'via-accent-2',
  pos: 'via-pos',
  warn: 'via-warn',
  purple: 'via-purple',
  danger: 'via-danger',
  muted: 'via-edge',
};

const TONE_FILL: Record<Tone, string> = {
  accent: 'bg-accent',
  accent2: 'bg-accent-2',
  pos: 'bg-pos',
  warn: 'bg-warn',
  purple: 'bg-purple',
  danger: 'bg-danger',
  muted: 'bg-dim',
};

const TONE_PILL: Record<Tone, string> = {
  accent: 'border-accent/40 text-accent bg-accent/10',
  accent2: 'border-accent-2/40 text-accent-2 bg-accent-2/10',
  pos: 'border-pos/40 text-pos bg-pos/10',
  warn: 'border-warn/40 text-warn bg-warn/10',
  purple: 'border-purple/40 text-purple bg-purple/10',
  danger: 'border-danger/40 text-danger bg-danger/10',
  muted: 'border-edge text-dim bg-white/5',
};

export function Card({
  children,
  className = '',
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      style={style}
      className={`relative rounded-lg border border-edge/60 bg-panel/70 p-5 backdrop-blur-sm panel-glow transition-[border-color,box-shadow] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:border-accent/30 ${className}`}
    >
      {children}
    </div>
  );
}

export function CardTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="mb-3 flex items-center gap-2 text-[11px] font-medium tracking-[0.18em] text-accent/70 uppercase">
      <span aria-hidden className="text-accent/50">
        ▸
      </span>
      {children}
    </h3>
  );
}

export function Stat({
  label,
  value,
  tone = 'accent',
  hint,
}: {
  label: string;
  value: ReactNode;
  tone?: Tone;
  hint?: string;
}) {
  return (
    <div className="group relative overflow-hidden rounded-lg border border-edge/60 bg-panel/70 p-4 backdrop-blur-sm panel-glow transition-[border-color] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:border-edge">
      <span
        aria-hidden
        className={`absolute inset-x-0 top-0 h-px scan-top bg-gradient-to-r from-transparent ${TONE_BAR[tone]} to-transparent opacity-70 transition-opacity duration-300 group-hover:opacity-100`}
      />
      <p className="text-[10px] tracking-[0.18em] text-dim uppercase">{label}</p>
      <p
        className={`text-display mt-1.5 text-[1.6rem] leading-none font-bold tracking-tight text-glow ${TONE_TEXT[tone]}`}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-[10px] text-ink/55">{hint}</p> : null}
    </div>
  );
}

export function Pill({ children, tone = 'accent' }: { children: ReactNode; tone?: Tone }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wider uppercase ${TONE_PILL[tone]}`}
    >
      {children}
    </span>
  );
}

// Mapa de status do domínio → tom de cor (mantém os mesmos rótulos que o app já usa).
const STATUS_TONE: Record<string, Tone> = {
  ACTIVE: 'pos',
  PAUSED: 'warn',
  ARCHIVED: 'muted',
  DELETED: 'danger',
  healthy: 'pos',
  watch: 'warn',
  underperforming: 'danger',
  learning: 'accent2',
  no_data: 'muted',
  error: 'danger',
  deployed: 'pos',
  draft: 'muted',
  building: 'accent2',
  failed: 'danger',
  ativa: 'pos',
  inativa: 'danger',
};

export function Badge({ value }: { value: string }) {
  return <Pill tone={STATUS_TONE[value] ?? 'muted'}>{value}</Pill>;
}

/** Barra de progresso fina (ex.: gasto relativo de uma campanha na tabela). */
export function ProgressBar({ value, tone = 'accent' }: { value: number; tone?: Tone }) {
  const pct = Math.max(2, Math.min(100, value));
  return (
    <div className="mt-1.5 h-0.5 w-full max-w-[200px] overflow-hidden rounded-full bg-white/5">
      <div className={`h-full rounded-full ${TONE_FILL[tone]}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-edge/60 bg-panel/40 backdrop-blur-sm panel-glow">
      <table className="w-full text-left text-sm [&_tbody_tr:hover]:bg-accent/5">{children}</table>
    </div>
  );
}

export function Th({ children, right = false }: { children: ReactNode; right?: boolean }) {
  return (
    <th
      className={`border-b border-edge/60 bg-panel/80 px-4 py-2.5 text-[10px] font-medium tracking-[0.16em] text-dim uppercase ${
        right ? 'text-right' : 'text-left'
      }`}
    >
      {children}
    </th>
  );
}

/**
 * Célula. `num` alinha à direita e usa a MESMA tipografia dos KPIs (fonte display + tabular-nums),
 * para que um valor leia igual num card e numa tabela — consistência pedida no design system.
 */
export function Td({
  children,
  num = false,
}: {
  children: ReactNode;
  num?: boolean;
}) {
  return (
    <td
      className={`border-b border-edge/30 px-4 py-2.5 ${
        num
          ? 'text-display text-right tracking-tight text-ink tabular-nums whitespace-nowrap'
          : 'text-ink/90'
      }`}
    >
      {children}
    </td>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <Card className="text-center text-sm text-dim">{children}</Card>;
}

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="mb-7">
      <div className="flex items-center gap-2.5">
        <span aria-hidden className="text-glow text-lg leading-none text-accent">
          ◈
        </span>
        <h1 className="text-display text-[1.7rem] leading-none font-bold tracking-[0.14em] text-ink uppercase">
          {title}
        </h1>
      </div>
      {/* régua de varredura sob o título — assinatura HUD discreta */}
      <div
        aria-hidden
        className="mt-3 h-px w-full max-w-md bg-gradient-to-r from-accent/60 via-accent/15 to-transparent"
      />
      {subtitle ? <p className="mt-2 text-xs tracking-wide text-ink/70">{subtitle}</p> : null}
    </header>
  );
}
