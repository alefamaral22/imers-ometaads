'use client';

import { motion } from 'motion/react';

/**
 * Painel Status / FPS (SPEC-018) — equalizador de barras (canal A) + onda senoidal rolando (canal B).
 * Sempre em movimento; `active` (Nexus/agentes) aumenta amplitude e velocidade. Decorativo (aria-hidden).
 */

const BAR_COUNT = 28;

function sinePath(width: number, height: number, periods: number): string {
  const mid = height / 2;
  const steps = 60;
  let d = '';
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * width;
    const y = mid + Math.sin((i / steps) * Math.PI * 2 * periods) * (mid * 0.7);
    d += `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)} `;
  }
  return d.trim();
}

export function StatusBars({ active = false }: { active?: boolean }) {
  const amp = active ? 1 : 0.55;
  const speed = active ? 0.7 : 1.4;

  return (
    <div aria-hidden className="space-y-3">
      <div>
        <p className="mb-1 text-[9px] tracking-[0.2em] text-dim uppercase">
          Canal A · {active ? 'atividade alta' : 'atividade normal'}
        </p>
        <div className="flex h-14 items-end gap-[3px]">
          {Array.from({ length: BAR_COUNT }, (_, i) => (
            <motion.span
              key={i}
              className="flex-1 rounded-sm bg-gradient-to-t from-accent2/40 to-accent"
              style={{ transformOrigin: 'bottom' }}
              animate={{ scaleY: [0.15, (0.4 + ((i * 13) % 9) / 12) * amp, 0.2, 0.9 * amp, 0.15] }}
              transition={{
                duration: speed + (i % 5) * 0.12,
                repeat: Infinity,
                ease: 'easeInOut',
                delay: (i % 7) * 0.06,
              }}
            />
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1 text-[9px] tracking-[0.2em] text-dim uppercase">
          Canal B · onda portadora
        </p>
        <div className="h-10 overflow-hidden rounded-md border border-edge/50 bg-bg/40">
          <svg viewBox="0 0 200 40" className="h-full w-full" preserveAspectRatio="none">
            <motion.g
              animate={{ x: [0, -100] }}
              transition={{ duration: speed * 2.5, repeat: Infinity, ease: 'linear' }}
            >
              <path
                d={sinePath(200, 40, 4)}
                fill="none"
                stroke="#38e6ff"
                strokeWidth={1.5}
                opacity={0.8}
              />
              <path
                d={sinePath(200, 40, 4)}
                fill="none"
                stroke="#38e6ff"
                strokeWidth={1.5}
                opacity={0.8}
                transform="translate(200,0)"
              />
            </motion.g>
          </svg>
        </div>
      </div>
    </div>
  );
}
