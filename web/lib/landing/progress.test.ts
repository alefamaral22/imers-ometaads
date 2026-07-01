import { describe, it, expect } from 'vitest';
import {
  landingSteps,
  estimateBuildPercent,
  progressMessage,
  isInProgress,
  TYPICAL_BUILD_MS,
  TYPICAL_GENERATE_MS,
} from './progress';

describe('landingSteps', () => {
  it('generating: rascunho ativo, resto pendente', () => {
    const s = landingSteps('generating');
    expect(s.map((x) => x.state)).toEqual(['active', 'pending', 'pending']);
  });
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
  it('generating cresce de 3% até no máximo 40%', () => {
    expect(estimateBuildPercent('generating', 0)).toBe(3);
    expect(estimateBuildPercent('generating', TYPICAL_GENERATE_MS)).toBe(40);
    expect(estimateBuildPercent('generating', TYPICAL_GENERATE_MS * 10)).toBe(40);
  });
  it('draft = 45 (rascunho pronto, publish na fila)', () => {
    expect(estimateBuildPercent('draft', 0)).toBe(45);
  });
  it('building cresce de 50% até no máximo 95%', () => {
    expect(estimateBuildPercent('building', 0)).toBe(50);
    expect(estimateBuildPercent('building', TYPICAL_BUILD_MS)).toBe(95);
    expect(estimateBuildPercent('building', TYPICAL_BUILD_MS * 10)).toBe(95);
  });
  it('a porcentagem nunca regride ao longo do ciclo', () => {
    const gen = estimateBuildPercent('generating', TYPICAL_GENERATE_MS);
    const draft = estimateBuildPercent('draft', 0);
    const build0 = estimateBuildPercent('building', 0);
    const build1 = estimateBuildPercent('building', TYPICAL_BUILD_MS);
    expect(draft).toBeGreaterThanOrEqual(gen);
    expect(build0).toBeGreaterThanOrEqual(draft);
    expect(build1).toBeGreaterThan(build0);
  });
});

describe('progressMessage / isInProgress', () => {
  it('mensagem por status', () => {
    expect(progressMessage('generating')).toContain('conteúdo');
    expect(progressMessage('deployed')).toContain('no ar');
    expect(progressMessage('failed')).toContain('falhou');
  });
  it('em andamento para generating/draft/building', () => {
    expect(isInProgress('generating')).toBe(true);
    expect(isInProgress('draft')).toBe(true);
    expect(isInProgress('building')).toBe(true);
    expect(isInProgress('deployed')).toBe(false);
    expect(isInProgress('failed')).toBe(false);
  });
});
