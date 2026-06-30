import { describe, it, expect } from 'vitest';
import {
  landingSteps,
  estimateBuildPercent,
  progressMessage,
  isInProgress,
  TYPICAL_BUILD_MS,
} from './progress';

describe('landingSteps', () => {
  it('draft: rascunho feito, publicando ativo', () => {
    const s = landingSteps('draft');
    expect(s.map((x) => x.state)).toEqual(['done', 'active', 'pending']);
  });
  it('deployed: tudo feito', () => {
    expect(landingSteps('deployed').every((x) => x.state === 'done')).toBe(true);
  });
  it('failed: publicar marcado como falha', () => {
    const s = landingSteps('failed');
    expect(s[1]?.state).toBe('failed');
  });
});

describe('estimateBuildPercent', () => {
  it('deployed/failed = 100', () => {
    expect(estimateBuildPercent('deployed', 0)).toBe(100);
    expect(estimateBuildPercent('failed', 999)).toBe(100);
  });
  it('draft = 10 (rascunho pronto, publish na fila)', () => {
    expect(estimateBuildPercent('draft', 0)).toBe(10);
  });
  it('building cresce com o tempo mas nunca passa de 95', () => {
    expect(estimateBuildPercent('building', 0)).toBe(15);
    expect(estimateBuildPercent('building', TYPICAL_BUILD_MS)).toBe(95);
    expect(estimateBuildPercent('building', TYPICAL_BUILD_MS * 10)).toBe(95);
  });
  it('building é monotônica no intervalo', () => {
    const a = estimateBuildPercent('building', TYPICAL_BUILD_MS * 0.25);
    const b = estimateBuildPercent('building', TYPICAL_BUILD_MS * 0.5);
    expect(b).toBeGreaterThan(a);
  });
});

describe('progressMessage / isInProgress', () => {
  it('mensagem por status', () => {
    expect(progressMessage('deployed')).toContain('no ar');
    expect(progressMessage('failed')).toContain('falhou');
  });
  it('em andamento só para draft/building', () => {
    expect(isInProgress('draft')).toBe(true);
    expect(isInProgress('building')).toBe(true);
    expect(isInProgress('deployed')).toBe(false);
    expect(isInProgress('failed')).toBe(false);
  });
});
