'use client';

import { motion, useReducedMotion } from 'motion/react';

/**
 * Orbe de fala do Nexus — núcleo reator com anéis de eco que expandem quando ele fala (`speaking`) e
 * uma respiração mais suave quando só está ativo (`active`). Compartilhado pelo widget de canto e pelo
 * console "Operação ao vivo". Respeita prefers-reduced-motion. Decorativo (aria-hidden).
 */
export function SpeakingOrb({
  speaking,
  active,
  size = 112,
}: {
  speaking: boolean;
  active: boolean;
  size?: number;
}) {
  const reduce = useReducedMotion();
  const hot = speaking || active;
  const ring = (delay: number) =>
    reduce
      ? {}
      : {
          scale: hot ? [1, 1.35, 1] : 1,
          opacity: hot ? [0.7, 0, 0.7] : 0.25,
          transition: { duration: 1.3, repeat: Infinity, ease: 'easeOut' as const, delay },
        };

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <motion.span className="absolute inset-0 rounded-full border border-accent/40" animate={ring(0)} />
      <motion.span className="absolute inset-[10%] rounded-full border border-accent/60" animate={ring(0.22)} />
      <motion.span className="absolute inset-[22%] rounded-full border border-accent/30" animate={ring(0.44)} />
      <motion.span
        className="reactor"
        style={{ width: size * 0.5, height: size * 0.5 }}
        animate={reduce ? {} : { scale: speaking ? [1, 1.14, 1] : [1, 1.04, 1] }}
        transition={{ duration: speaking ? 0.85 : 2, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
  );
}
