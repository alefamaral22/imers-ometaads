import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VAD_CONFIG,
  initVadState,
  rmsFromTimeDomain,
  vadStep,
  type VadConfig,
  type VadState,
} from './vad';

const cfg: VadConfig = {
  speechThreshold: 0.025,
  minSpeechMs: 200,
  silenceHangoverMs: 600,
  maxUtteranceMs: 5000,
};

/** Feeds a sequence of {level,tMs} samples and collects the emitted events. */
function run(samples: Array<{ level: number; tMs: number }>, c: VadConfig = cfg) {
  let state: VadState = initVadState();
  const events: string[] = [];
  for (const s of samples) {
    const step = vadStep(state, s, c);
    state = step.state;
    if (step.event) events.push(step.event);
  }
  return { state, events };
}

describe('vadStep — começo de fala', () => {
  it('emite speech-start na primeira amostra acima do limiar', () => {
    const { events, state } = run([
      { level: 0.001, tMs: 0 },
      { level: 0.001, tMs: 50 },
      { level: 0.1, tMs: 100 },
    ]);
    expect(events).toEqual(['speech-start']);
    expect(state.phase).toBe('speaking');
  });

  it('permanece idle no silêncio', () => {
    const { events, state } = run([
      { level: 0.001, tMs: 0 },
      { level: 0.005, tMs: 50 },
      { level: 0.0, tMs: 100 },
    ]);
    expect(events).toEqual([]);
    expect(state.phase).toBe('idle');
  });
});

describe('vadStep — fim de utterance por silêncio', () => {
  it('encerra após silêncio ≥ hangover quando houve fala suficiente', () => {
    const samples = [
      { level: 0.1, tMs: 0 }, // speech-start
      { level: 0.1, tMs: 50 },
      { level: 0.1, tMs: 100 },
      { level: 0.1, tMs: 150 },
      { level: 0.1, tMs: 200 },
      { level: 0.1, tMs: 250 }, // ~250ms de fala > minSpeechMs
      { level: 0.0, tMs: 400 },
      { level: 0.0, tMs: 700 },
      { level: 0.0, tMs: 900 }, // 650ms de silêncio > hangover
    ];
    const { events } = run(samples);
    expect(events).toEqual(['speech-start', 'utterance-end']);
  });

  it('descarta ruído curto sem emitir utterance-end (volta a idle)', () => {
    const samples = [
      { level: 0.1, tMs: 0 }, // speech-start (estalo)
      { level: 0.0, tMs: 50 }, // só ~0ms de voz acumulada
      { level: 0.0, tMs: 400 },
      { level: 0.0, tMs: 700 }, // silêncio > hangover, mas fala < minSpeechMs
    ];
    const { events, state } = run(samples);
    expect(events).toEqual(['speech-start']);
    expect(state.phase).toBe('idle');
  });

  it('pausas curtas dentro da fala não encerram a utterance', () => {
    const samples = [
      { level: 0.1, tMs: 0 },
      { level: 0.1, tMs: 100 },
      { level: 0.1, tMs: 200 },
      { level: 0.0, tMs: 300 }, // pausa de 300ms < hangover
      { level: 0.1, tMs: 450 }, // volta a falar
      { level: 0.1, tMs: 550 },
    ];
    const { events, state } = run(samples);
    expect(events).toEqual(['speech-start']);
    expect(state.phase).toBe('speaking');
  });
});

describe('vadStep — teto duro', () => {
  it('força o fim ao atingir maxUtteranceMs mesmo com voz contínua', () => {
    const samples = [];
    for (let t = 0; t <= 5200; t += 100) samples.push({ level: 0.2, tMs: t });
    const { events } = run(samples);
    expect(events).toContain('speech-start');
    expect(events.filter((e) => e === 'utterance-end').length).toBeGreaterThanOrEqual(1);
  });
});

describe('rmsFromTimeDomain', () => {
  it('é 0 para silêncio (tudo centrado em 128)', () => {
    expect(rmsFromTimeDomain([128, 128, 128, 128])).toBe(0);
    expect(rmsFromTimeDomain([])).toBe(0);
  });
  it('cresce com a amplitude', () => {
    const quiet = rmsFromTimeDomain([130, 126, 129, 127]);
    const loud = rmsFromTimeDomain([200, 56, 210, 40]);
    expect(loud).toBeGreaterThan(quiet);
    expect(loud).toBeLessThanOrEqual(1);
  });
});

describe('DEFAULT_VAD_CONFIG', () => {
  it('tem limiares plausíveis para fala PT', () => {
    expect(DEFAULT_VAD_CONFIG.speechThreshold).toBeGreaterThan(0);
    expect(DEFAULT_VAD_CONFIG.silenceHangoverMs).toBeGreaterThan(DEFAULT_VAD_CONFIG.minSpeechMs);
  });
});
