'use client';

import { motion, useReducedMotion } from 'motion/react';

/**
 * Moldura SVG do VoiceOrb (camadas decorativas: anéis de instrumento, ticks, marcação grossa, círculo
 * de escaneamento, blips e bobinas do reator). Barata e nítida em qualquer tamanho — o núcleo reativo
 * (esfera + neurônios) é desenhado por cima em WebGL. `hot`/`speaking` aceleram e iluminam. Respeita
 * prefers-reduced-motion (loops desligam; o desenho estático segue rico). Decorativo (aria-hidden).
 *
 * `detail='full'` (orbe grande) traz todas as camadas; `detail='min'` (miniatura do chat) mantém só
 * dois anéis finos — os ticks e o sweep somem em tamanho pequeno e só pesariam a tela.
 */
const C = 260; // centro do viewBox 520x520

const round = (v: number) => Math.round(v * 100) / 100; // evita mismatch de hydration (float server≠client)
const polar = (r: number, deg: number) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return { x: round(C + r * Math.cos(a)), y: round(C + r * Math.sin(a)) };
};

function ticks(radius: number, count: number, len: number) {
  return Array.from({ length: count }, (_, i) => {
    const p1 = polar(radius, (i / count) * 360);
    const p2 = polar(radius - len, (i / count) * 360);
    return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, key: i };
  });
}

export function OrbRings({
  detail,
  hot,
  speaking,
}: {
  detail: 'full' | 'min';
  hot: boolean;
  speaking: boolean;
}) {
  const reduce = useReducedMotion();
  const spin = (base: number) => (reduce ? 0 : hot ? base * 0.5 : base);
  const loop = <T extends object>(cfg: T): T => (reduce ? ({} as T) : cfg);

  return (
    <svg viewBox="0 0 520 520" className="absolute inset-0 h-full w-full" aria-hidden>
      <defs>
        <filter id="orb-glow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {detail === 'full' ? (
        <>
          {/* anel externo + ticks finos, girando devagar */}
          <motion.g
            style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
            animate={loop({ rotate: 360 })}
            transition={{ duration: spin(48), repeat: Infinity, ease: 'linear' }}
          >
            <circle cx={C} cy={C} r={246} fill="none" stroke="rgba(23,58,85,0.95)" strokeWidth={1.5} />
            <circle cx={C} cy={C} r={228} fill="none" stroke="rgba(56,230,255,0.18)" strokeWidth={1} />
            {ticks(246, 96, 8).map((t) => (
              <line key={t.key} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke="rgba(56,230,255,0.4)" strokeWidth={1} />
            ))}
          </motion.g>

          {/* marcação grossa (a cada 30°) + círculo tracejado de escaneamento, contra-rotação */}
          <motion.g
            style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
            animate={loop({ rotate: -360 })}
            transition={{ duration: spin(30), repeat: Infinity, ease: 'linear' }}
          >
            {ticks(214, 12, 22).map((t) => (
              <line key={t.key} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke="rgba(56,230,255,0.55)" strokeWidth={3} strokeLinecap="round" />
            ))}
            <circle cx={C} cy={C} r={188} fill="none" stroke="#38e6ff" strokeWidth={1.5} strokeDasharray="1 12" opacity={0.7} filter="url(#orb-glow)" />
          </motion.g>

          {/* blips no anel do meio — pontinhos que acendem em sequência (camada 4 do spec) */}
          <g filter="url(#orb-glow)">
            {ticks(170, 16, 0).map((t, i) => (
              <motion.circle
                key={t.key}
                cx={t.x1}
                cy={t.y1}
                r={2.4}
                fill="#7df0ff"
                animate={reduce ? {} : { opacity: hot ? [0.25, 1, 0.25] : [0.2, 0.6, 0.2] }}
                transition={{ duration: hot ? 1.6 : 3, repeat: Infinity, ease: 'easeInOut', delay: (i / 16) * (hot ? 1.6 : 3) }}
              />
            ))}
          </g>

          {/* anel fino de enquadramento do globo (sem bobinas — o globo neural é o herói) */}
          <circle cx={C} cy={C} r={150} fill="none" stroke="rgba(56,230,255,0.22)" strokeWidth={1} />
          <circle cx={C} cy={C} r={142} fill="none" stroke="rgba(56,230,255,0.10)" strokeWidth={1} />
        </>
      ) : (
        // miniatura: só dois anéis finos (sem ticks/sweep)
        <>
          <circle cx={C} cy={C} r={232} fill="none" stroke="rgba(56,230,255,0.25)" strokeWidth={4} />
          <motion.circle
            cx={C}
            cy={C}
            r={196}
            fill="none"
            stroke="#38e6ff"
            strokeWidth={3}
            strokeDasharray="2 14"
            opacity={0.7}
            filter="url(#orb-glow)"
            style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
            animate={loop({ rotate: speaking ? 360 : 180 })}
            transition={{ duration: spin(14), repeat: Infinity, ease: 'linear' }}
          />
        </>
      )}
    </svg>
  );
}
