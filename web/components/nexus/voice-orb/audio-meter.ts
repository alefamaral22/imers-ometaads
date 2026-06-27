'use client';

import { rmsFromTimeDomain } from '../../../lib/nexus/domain/vad';

/**
 * Medidor de áudio compartilhado do orbe do Nexus (sem React). Lê o "quão alto" está o som — do
 * microfone (MediaStream) e/ou da voz da IA (HTMLMediaElement do TTS) — e escreve um nível 0..1 (alvo,
 * já NORMALIZADO mas SEM suavização) em `levelRef`. A suavização (attack/decay) fica no renderizador do
 * orbe, que lê esse ref por frame — assim não há re-render do React a 60fps.
 *
 * Privacidade/bateria: o AudioContext sobe sob demanda e é suspenso quando nenhuma fonte está ativa.
 * Nível de áudio é DADO, não instrução (regra de segurança do projeto).
 */
export interface AudioMeter {
  /** Liga o medidor a um stream de microfone. Retorna a função de desconectar. */
  meterStream(stream: MediaStream): () => void;
  /** Liga o medidor ao áudio do TTS, mantendo-o audível (source → destino). Retorna desconectar. */
  meterElement(el: HTMLMediaElement): () => void;
  /** Sobe/retoma o AudioContext; resolve `true` se está realmente tocando (senão, não roteie áudio). */
  resume(): Promise<boolean>;
  /** Encerra o AudioContext e zera tudo. */
  dispose(): void;
}

/** RMS típico de fala: silêncio < 0.01, voz 0.03–0.30. Mapeia para 0..1 com um piso de ruído. */
export function normalizeLevel(rms: number): number {
  const v = (rms - 0.012) / 0.33;
  return v <= 0 ? 0 : v >= 1 ? 1 : v;
}

function resolveAudioContextCtor(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null;
  return (
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ??
    null
  );
}

export function createAudioMeter(levelRef: { current: number }): AudioMeter {
  const CtxCtor = resolveAudioContextCtor();

  // Sem Web Audio: medidor inerte (o orbe cai no modo "respiração" sem reatividade).
  if (!CtxCtor) {
    return {
      meterStream: () => () => undefined,
      meterElement: () => () => undefined,
      resume: () => Promise.resolve(false),
      dispose: () => undefined,
    };
  }

  let ctx: AudioContext | null = null;
  const active = new Set<AnalyserNode>();
  const buffers = new WeakMap<AnalyserNode, Uint8Array<ArrayBuffer>>();
  // Um elemento só pode virar source uma vez por contexto — cacheamos para reanexar sem erro.
  const elementSources = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>();
  let raf: number | null = null;

  const ensureCtx = (): AudioContext => {
    if (!ctx) ctx = new CtxCtor();
    void ctx.resume().catch(() => undefined);
    return ctx;
  };

  const loop = () => {
    let peak = 0;
    for (const analyser of active) {
      const buf = buffers.get(analyser);
      if (!buf) continue;
      analyser.getByteTimeDomainData(buf);
      peak = Math.max(peak, normalizeLevel(rmsFromTimeDomain(buf)));
    }
    levelRef.current = peak;
    raf = active.size > 0 ? requestAnimationFrame(loop) : null;
  };

  const startLoop = () => {
    if (raf === null && active.size > 0) raf = requestAnimationFrame(loop);
  };

  const stopIfIdle = () => {
    if (active.size > 0) return;
    levelRef.current = 0;
    if (raf !== null) {
      cancelAnimationFrame(raf);
      raf = null;
    }
    void ctx?.suspend().catch(() => undefined);
  };

  const makeAnalyser = (c: AudioContext): AnalyserNode => {
    const analyser = c.createAnalyser();
    analyser.fftSize = 1024;
    buffers.set(analyser, new Uint8Array(new ArrayBuffer(analyser.fftSize)));
    return analyser;
  };

  return {
    async resume() {
      const c = ensureCtx();
      await c.resume().catch(() => undefined);
      return c.state === 'running';
    },
    meterStream(stream) {
      const c = ensureCtx();
      const source = c.createMediaStreamSource(stream);
      const analyser = makeAnalyser(c);
      source.connect(analyser); // não conecta ao destino: não devolvemos o mic aos alto-falantes
      active.add(analyser);
      startLoop();
      return () => {
        active.delete(analyser);
        try {
          source.disconnect();
          analyser.disconnect();
        } catch {
          /* já desconectado */
        }
        stopIfIdle();
      };
    },
    meterElement(el) {
      const c = ensureCtx();
      let source = elementSources.get(el);
      if (!source) {
        source = c.createMediaElementSource(el);
        source.connect(c.destination); // mantém o TTS audível
        elementSources.set(el, source);
      }
      const analyser = makeAnalyser(c);
      source.connect(analyser);
      active.add(analyser);
      startLoop();
      return () => {
        active.delete(analyser);
        try {
          source.disconnect(analyser);
          analyser.disconnect();
        } catch {
          /* já desconectado */
        }
        stopIfIdle();
      };
    },
    dispose() {
      active.clear();
      if (raf !== null) {
        cancelAnimationFrame(raf);
        raf = null;
      }
      levelRef.current = 0;
      void ctx?.close().catch(() => undefined);
      ctx = null;
    },
  };
}
