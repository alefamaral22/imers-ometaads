'use client';

import { useEffect, useState } from 'react';
import {
  landingSteps,
  estimateBuildPercent,
  progressMessage,
  type LandingStatus,
  type StepState,
} from '../../lib/landing/progress';

/**
 * Card didático do progresso de criação/publicação de uma landing page. A criação roda no runner
 * (Fly.io), desacoplada do dashboard: o operador PODE fechar ou atualizar a aba sem parar nada — o
 * estado vive no banco. O tique local sobe a barra por estimativa de tempo; a virada de status
 * (draft→building→deployed) vem do server refresh centralizado em BuildingAutoRefresh.
 */
export function LandingProgress({
  subdomain,
  status,
  startedAt,
}: {
  subdomain: string;
  status: LandingStatus;
  startedAt: string;
}) {
  const start = new Date(startedAt).getTime();
  const [elapsed, setElapsed] = useState(() => Math.max(0, Date.now() - start));

  // Só o tique local que sobe a barra durante o build (o refresh do servidor é centralizado).
  useEffect(() => {
    if (status !== 'building') return;
    const tick = setInterval(() => setElapsed(Math.max(0, Date.now() - start)), 2000);
    return () => clearInterval(tick);
  }, [status, start]);

  const pct = estimateBuildPercent(status, elapsed);
  const steps = landingSteps(status);
  const failed = status === 'failed';

  return (
    <div className="mb-6 rounded-lg border border-accent-2/40 bg-panel/70 p-5 backdrop-blur-sm panel-glow">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h3 className="flex items-center gap-2 text-[11px] font-medium tracking-[0.18em] text-accent-2/80 uppercase">
          <span aria-hidden className="reactor h-3 w-3" />
          Criando {subdomain}
        </h3>
        <span
          className={`text-display text-[1.6rem] leading-none font-bold tabular-nums ${
            failed ? 'text-danger' : 'text-accent-2'
          }`}
        >
          {pct}%
        </span>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
        <div
          className={`h-full rounded-full transition-[width] duration-1000 ease-out ${
            failed ? 'bg-danger' : 'bg-accent-2'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <ol className="mt-4 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-4">
        {steps.map((step, i) => (
          <li key={step.label} className="flex items-center gap-2">
            <StepDot state={step.state} index={i + 1} />
            <span
              className={`text-xs ${
                step.state === 'done'
                  ? 'text-ink/80'
                  : step.state === 'active'
                    ? 'text-accent-2'
                    : step.state === 'failed'
                      ? 'text-danger'
                      : 'text-dim'
              }`}
            >
              {step.label}
            </span>
          </li>
        ))}
      </ol>

      <p className="mt-4 text-xs text-ink/70">{progressMessage(status)}</p>
      {status === 'building' || status === 'draft' ? (
        <p className="mt-1 text-[11px] text-dim">
          Pode fechar ou atualizar esta página — a criação continua no servidor.
        </p>
      ) : null}
    </div>
  );
}

function StepDot({ state, index }: { state: StepState; index: number }) {
  if (state === 'done') {
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-pos/20 text-[11px] text-pos">
        ✓
      </span>
    );
  }
  if (state === 'failed') {
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-danger/20 text-[11px] text-danger">
        ✕
      </span>
    );
  }
  if (state === 'active') {
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full border border-accent-2/60 bg-accent-2/10">
        <span aria-hidden className="reactor h-2.5 w-2.5" />
      </span>
    );
  }
  return (
    <span className="flex h-5 w-5 items-center justify-center rounded-full border border-edge/70 text-[10px] text-dim">
      {index}
    </span>
  );
}
