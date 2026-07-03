'use client';

import { motion, useReducedMotion } from 'motion/react';
import { OrbRings } from './orb-rings';
import { OrbCoreWebGL } from './orb-core-webgl';

/**
 * VoiceOrb — visualizador "HUD / núcleo de energia" do assistente de voz Nexus. Duas versões com a
 * MESMA alma (moldura SVG + núcleo WebGL reativo ao áudio), variando só escala e detalhe:
 *  - `size="lg"` — tela principal / Operação ao vivo (todas as camadas);
 *  - `size="sm"` — miniatura embutida no chat (sem ticks/sweep externos).
 *
 * `levelRef` (0..1) é o nível de áudio ao vivo (mic do usuário ou voz da IA); o núcleo o lê por frame,
 * sem re-render. `state` controla a "temperatura" da moldura. Decorativo: aria-hidden (quem narra o
 * estado para leitores de tela é o texto "Falando…/Ouvindo…" ao lado). Ver
 * docs/design/jarvis-visual-system.md e docs/design/voice-visualizer-spec.md.
 */
export type VoiceOrbState = 'idle' | 'listening' | 'speaking';

const IDLE_LEVEL = { current: 0 };

export function VoiceOrb({
  size,
  state,
  levelRef,
  busy = false,
  px = 96,
  className = '',
}: {
  size: 'lg' | 'sm';
  state: VoiceOrbState;
  /** Nível de áudio 0..1 ao vivo. Se omitido, o orbe só "respira" (sem reatividade). */
  levelRef?: { current: number };
  /** Agentes trabalhando: anima/dispara os neurônios mesmo sem áudio captado. */
  busy?: boolean;
  /** Lado em px da miniatura (`size="sm"`). Ignorado no `lg` (responsivo até 520px). */
  px?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const hot = state !== 'idle' || busy;
  const speaking = state === 'speaking';
  const level = levelRef ?? IDLE_LEVEL;
  const detail = size === 'lg' ? 'full' : 'min';
  const coreSize = size === 'lg' ? 400 : Math.round(px * 0.7);

  const boxStyle = size === 'lg' ? undefined : { width: px, height: px };
  const boxClass =
    size === 'lg'
      ? 'relative flex aspect-square w-full max-w-[520px] items-center justify-center'
      : 'relative flex items-center justify-center';

  return (
    <div className={`${boxClass} ${className}`} style={boxStyle} aria-hidden>
      {/* halo de profundidade que respira */}
      <motion.div
        className="absolute inset-[8%] rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(56,230,255,0.2), transparent 62%)' }}
        animate={
          reduce
            ? {}
            : {
                opacity: hot ? [0.55, 1, 0.55] : [0.35, 0.55, 0.35],
                scale: hot ? [1, 1.05, 1] : [1, 1.02, 1],
              }
        }
        transition={{ duration: hot ? 1.6 : 3.4, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* varredura de radar (só no orbe grande) */}
      {size === 'lg' && !reduce ? (
        <motion.div
          className="absolute inset-[14%] rounded-full"
          style={{
            background:
              'conic-gradient(from 0deg, transparent 0deg, transparent 250deg, rgba(56,230,255,0.13) 350deg, transparent 360deg)',
            maskImage:
              'radial-gradient(circle, transparent 38%, #000 40%, #000 96%, transparent 98%)',
            WebkitMaskImage:
              'radial-gradient(circle, transparent 38%, #000 40%, #000 96%, transparent 98%)',
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: hot ? 3 : 6, repeat: Infinity, ease: 'linear' }}
        />
      ) : null}

      {/* ondas de energia emanando quando fala */}
      {speaking && !reduce
        ? [0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="absolute inset-[24%] rounded-full border border-accent/40"
              initial={{ scale: 0.6, opacity: 0.5 }}
              animate={{ scale: 1.45, opacity: 0 }}
              transition={{ duration: 2.2, repeat: Infinity, ease: 'easeOut', delay: i * 0.7 }}
            />
          ))
        : null}

      <OrbRings detail={detail} hot={hot} speaking={speaking} />

      {/* núcleo reativo (WebGL) centralizado por cima da moldura */}
      <div
        className="relative flex items-center justify-center"
        style={{ width: coreSize, height: coreSize }}
      >
        <OrbCoreWebGL size={coreSize} detail={detail} levelRef={level} active={hot} />
      </div>
    </div>
  );
}
