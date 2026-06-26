import type { SeriesPoint } from '../lib/domain/overview-metrics';
import { formatCents, formatRatioPercent } from '../lib/domain/format';

/**
 * Gráficos SVG inline da visão geral (SPEC-017) — sem dependência de chart. Renderizam o que houver
 * de histórico (um ponto por análise); degradam para uma baseline plana quando tudo é zero.
 */

const W = 560;
const H = 200;
const PAD = { top: 16, right: 16, bottom: 24, left: 44 };
const innerW = W - PAD.left - PAD.right;
const innerH = H - PAD.top - PAD.bottom;

function xAt(i: number, n: number): number {
  if (n <= 1) return PAD.left + innerW / 2;
  return PAD.left + (innerW * i) / (n - 1);
}

/** Mapeia um valor [0..max] para a coordenada Y (invertida). max=0 → baseline. */
function yAt(value: number, max: number): number {
  if (max <= 0) return PAD.top + innerH;
  return PAD.top + innerH - (innerH * value) / max;
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(d);
}

function linePath(points: readonly SeriesPoint[], value: (p: SeriesPoint) => number, max: number): string {
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i, points.length).toFixed(1)} ${yAt(value(p), max).toFixed(1)}`)
    .join(' ');
}

export function SpendBarChart({ series }: { series: readonly SeriesPoint[] }) {
  const max = Math.max(0, ...series.map((p) => p.spendCents));
  const n = series.length;
  const barW = n > 0 ? Math.min(28, (innerW / n) * 0.6) : 0;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Gasto por análise">
      <line x1={PAD.left} y1={PAD.top + innerH} x2={W - PAD.right} y2={PAD.top + innerH} className="stroke-edge" strokeWidth={1} />
      {series.map((p, i) => {
        const h = max > 0 ? (innerH * p.spendCents) / max : 0;
        const x = xAt(i, n) - barW / 2;
        return (
          <g key={p.at}>
            <rect x={x} y={PAD.top + innerH - h} width={barW} height={h} rx={2} className="fill-accent/70" />
            <text x={xAt(i, n)} y={H - 6} textAnchor="middle" className="fill-dim text-[9px]">
              {shortDate(p.at)}
            </text>
          </g>
        );
      })}
      <text x={PAD.left} y={PAD.top - 4} className="fill-dim text-[9px]">
        máx {formatCents(max)}
      </text>
    </svg>
  );
}

export function CtrCpcChart({ series }: { series: readonly SeriesPoint[] }) {
  const ctrMax = Math.max(0, ...series.map((p) => p.ctr));
  const cpcMax = Math.max(0, ...series.map((p) => p.cpcCents));
  const n = series.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="CTR e CPC por análise">
      <line x1={PAD.left} y1={PAD.top + innerH} x2={W - PAD.right} y2={PAD.top + innerH} className="stroke-edge" strokeWidth={1} />
      {n > 0 ? (
        <>
          <path d={linePath(series, (p) => p.ctr, ctrMax)} fill="none" className="stroke-accent" strokeWidth={2} />
          <path d={linePath(series, (p) => p.cpcCents, cpcMax)} fill="none" className="stroke-warn" strokeWidth={2} />
          {series.map((p, i) => (
            <text key={p.at} x={xAt(i, n)} y={H - 6} textAnchor="middle" className="fill-dim text-[9px]">
              {shortDate(p.at)}
            </text>
          ))}
        </>
      ) : null}
      <text x={PAD.left} y={PAD.top - 4} className="fill-accent text-[9px]">
        CTR (máx {formatRatioPercent(ctrMax)})
      </text>
      <text x={W - PAD.right} y={PAD.top - 4} textAnchor="end" className="fill-warn text-[9px]">
        CPC (máx {formatCents(cpcMax)})
      </text>
    </svg>
  );
}
