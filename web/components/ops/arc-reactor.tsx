'use client';

import { motion, useReducedMotion } from 'motion/react';

/**
 * ARC REACTOR — núcleo visual da "Operação ao vivo" (SPEC-018). Estética Homem de Ferro: bobinas
 * (coils) em volta do núcleo branco-quente, varredura de radar, anéis de energia emanando e detalhe
 * técnico girando. `working`/`speaking` aquecem tudo (mais rápido, mais brilho). Respeita
 * prefers-reduced-motion (loops desligam; o desenho estático segue rico). Decorativo (aria-hidden).
 */
const C = 260; // centro do viewBox 520x520

const polar = (r: number, deg: number) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return { x: C + r * Math.cos(a), y: C + r * Math.sin(a) };
};

function ticks(radius: number, count: number, len: number) {
  return Array.from({ length: count }, (_, i) => {
    const p1 = polar(radius, (i / count) * 360);
    const p2 = polar(radius - len, (i / count) * 360);
    return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, key: i };
  });
}

/** Bobinas do reator: trapézios radiais com folga entre eles — a assinatura do arc reactor. */
function coils(ri: number, ro: number, count: number, half: number) {
  return Array.from({ length: count }, (_, i) => {
    const a = (i / count) * 360;
    const p1 = polar(ri, a - half);
    const p2 = polar(ro, a - half * 0.72);
    const p3 = polar(ro, a + half * 0.72);
    const p4 = polar(ri, a + half);
    return { d: `M${p1.x} ${p1.y} L${p2.x} ${p2.y} L${p3.x} ${p3.y} L${p4.x} ${p4.y} Z`, key: i };
  });
}

export function ArcReactor({
  working = false,
  speaking = false,
}: {
  working?: boolean;
  speaking?: boolean;
}) {
  const reduce = useReducedMotion();
  const hot = working || speaking;
  const spin = (base: number) => (reduce ? 0 : hot ? base * 0.5 : base);
  const loop = <T extends object>(cfg: T): T => (reduce ? ({} as T) : cfg);

  return (
    <div className="relative flex aspect-square w-full max-w-[520px] items-center justify-center">
      {/* halo de profundidade que respira */}
      <motion.div
        aria-hidden
        className="absolute inset-[8%] rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(56,230,255,0.2), transparent 62%)' }}
        animate={loop({
          opacity: hot ? [0.55, 1, 0.55] : [0.35, 0.55, 0.35],
          scale: hot ? [1, 1.05, 1] : [1, 1.02, 1],
        })}
        transition={{ duration: hot ? 1.6 : 3.4, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* varredura de radar (conic via CSS, mascarada em anel) */}
      <motion.div
        aria-hidden
        className="absolute inset-[14%] rounded-full"
        style={{
          background:
            'conic-gradient(from 0deg, transparent 0deg, transparent 300deg, rgba(56,230,255,0.0) 320deg, rgba(56,230,255,0.45) 358deg, transparent 360deg)',
          maskImage: 'radial-gradient(circle, transparent 38%, #000 40%, #000 96%, transparent 98%)',
          WebkitMaskImage:
            'radial-gradient(circle, transparent 38%, #000 40%, #000 96%, transparent 98%)',
        }}
        animate={loop({ rotate: 360 })}
        transition={{ duration: spin(6), repeat: Infinity, ease: 'linear' }}
      />

      {/* ondas de energia emanando (só quando aquecido) */}
      {hot && !reduce
        ? [0, 1, 2].map((i) => (
            <motion.span
              key={i}
              aria-hidden
              className="absolute inset-[20%] rounded-full border border-accent/40"
              initial={{ scale: 0.6, opacity: 0.5 }}
              animate={{ scale: 1.5, opacity: 0 }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeOut', delay: i * 0.8 }}
            />
          ))
        : null}

      <svg viewBox="0 0 520 520" className="relative h-full w-full" aria-hidden>
        <defs>
          <radialGradient id="ar-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="22%" stopColor="#d4faff" />
            <stop offset="48%" stopColor="#38e6ff" />
            <stop offset="78%" stopColor="rgba(42,159,255,0.35)" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
          <linearGradient id="ar-coil" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#bdf6ff" />
            <stop offset="55%" stopColor="#38e6ff" />
            <stop offset="100%" stopColor="rgba(42,159,255,0.25)" />
          </linearGradient>
          <filter id="ar-glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="5" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="ar-bloom" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="14" />
          </filter>
        </defs>

        {/* anel externo: aro + ticks finos, girando devagar */}
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

        {/* anel de marcação grossa (a cada 30°), girando ao contrário */}
        <motion.g
          style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
          animate={loop({ rotate: -360 })}
          transition={{ duration: spin(30), repeat: Infinity, ease: 'linear' }}
        >
          {ticks(214, 12, 22).map((t) => (
            <line key={t.key} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke="rgba(56,230,255,0.55)" strokeWidth={3} strokeLinecap="round" />
          ))}
          <circle cx={C} cy={C} r={188} fill="none" stroke="#38e6ff" strokeWidth={1.5} strokeDasharray="1 12" opacity={0.7} filter="url(#ar-glow)" />
        </motion.g>

        {/* bobinas (coils) — a assinatura do arc reactor, girando devagar */}
        <motion.g
          style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
          animate={loop({ rotate: 360 })}
          transition={{ duration: spin(22), repeat: Infinity, ease: 'linear' }}
          filter="url(#ar-glow)"
        >
          <circle cx={C} cy={C} r={158} fill="none" stroke="rgba(56,230,255,0.25)" strokeWidth={1} />
          <circle cx={C} cy={C} r={104} fill="none" stroke="rgba(56,230,255,0.3)" strokeWidth={1} />
          {coils(108, 154, 9, 18).map((c) => (
            <path key={c.key} d={c.d} fill="url(#ar-coil)" opacity={0.92} stroke="rgba(189,246,255,0.5)" strokeWidth={0.75} />
          ))}
        </motion.g>

        {/* núcleo: bloom + branco-quente pulsando */}
        <motion.circle
          cx={C}
          cy={C}
          r={96}
          fill="url(#ar-core)"
          filter="url(#ar-bloom)"
          style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
          animate={loop({ opacity: hot ? [0.7, 1, 0.7] : [0.55, 0.8, 0.55], scale: hot ? [1, 1.08, 1] : [1, 1.03, 1] })}
          transition={{ duration: hot ? 1.1 : 2.6, repeat: Infinity, ease: 'easeInOut' }}
        />
        <circle cx={C} cy={C} r={62} fill="url(#ar-core)" filter="url(#ar-glow)" />
        <motion.circle
          cx={C}
          cy={C}
          r={30}
          fill="#ffffff"
          style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
          animate={loop({ opacity: hot ? [0.9, 1, 0.9] : [0.8, 0.95, 0.8] })}
          transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
        />
        {/* triângulo interno do reator (detalhe icônico) */}
        <polygon
          points={[polar(34, 0), polar(34, 120), polar(34, 240)].map((p) => `${p.x},${p.y}`).join(' ')}
          fill="none"
          stroke="rgba(56,230,255,0.6)"
          strokeWidth={1.5}
        />
      </svg>
    </div>
  );
}
