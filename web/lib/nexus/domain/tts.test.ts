import { describe, expect, it } from 'vitest';
import {
  buildMinimaxBody,
  clampPitch,
  clampSpeed,
  clampVol,
  DEFAULT_MINIMAX_VOICE,
  hexToBytes,
  parseMinimaxResponse,
  resolveMinimaxVoice,
  resolveTtsProvider,
} from './tts';

describe('resolveTtsProvider', () => {
  it('defaults to elevenlabs when absent/invalid', () => {
    expect(resolveTtsProvider(undefined)).toBe('elevenlabs');
    expect(resolveTtsProvider('foo')).toBe('elevenlabs');
  });
  it('accepts the known providers', () => {
    expect(resolveTtsProvider('minimax')).toBe('minimax');
    expect(resolveTtsProvider('elevenlabs')).toBe('elevenlabs');
  });
});

describe('resolveMinimaxVoice (allowlist deny-by-default)', () => {
  it('prefers a valid requested voice', () => {
    expect(resolveMinimaxVoice('Portuguese_Godfather', undefined)).toBe('Portuguese_Godfather');
  });
  it('falls back to the env voice, then the default', () => {
    expect(resolveMinimaxVoice(undefined, 'Portuguese_WiseLady')).toBe('Portuguese_WiseLady');
    expect(resolveMinimaxVoice(undefined, undefined)).toBe(DEFAULT_MINIMAX_VOICE);
  });
  it('rejects unknown voices (no injection of arbitrary ids)', () => {
    expect(resolveMinimaxVoice('rm -rf', 'also bad')).toBe(DEFAULT_MINIMAX_VOICE);
  });
});

describe('clamps (ranges da MiniMax)', () => {
  it('speed 0.5..2.0, default 1.1', () => {
    expect(clampSpeed(undefined)).toBe(1.1);
    expect(clampSpeed(5)).toBe(2);
    expect(clampSpeed(0.1)).toBe(0.5);
  });
  it('pitch -12..12 inteiro, default 0', () => {
    expect(clampPitch(undefined)).toBe(0);
    expect(clampPitch(99)).toBe(12);
    expect(clampPitch(-99)).toBe(-12);
    expect(clampPitch(3.7)).toBe(4);
  });
  it('vol 0.1..10, default 1', () => {
    expect(clampVol(undefined)).toBe(1);
    expect(clampVol(0)).toBe(0.1);
    expect(clampVol(50)).toBe(10);
  });
});

describe('buildMinimaxBody (parâmetros fixos de produção)', () => {
  it('usa speech-02-turbo, language_boost pt e o voice_setting/audio_setting exatos', () => {
    const body = buildMinimaxBody('Olá mundo', {
      voice: 'Portuguese_Solemn_Narrator_v1',
      speed: 1.1,
      pitch: 0,
      vol: 1,
    });
    expect(body.model).toBe('speech-02-turbo');
    expect(body.language_boost).toBe('pt');
    expect(body.stream).toBe(false);
    expect(body.voice_setting).toEqual({
      voice_id: 'Portuguese_Solemn_Narrator_v1',
      speed: 1.1,
      vol: 1,
      pitch: 0,
    });
    expect(body.audio_setting).toEqual({
      sample_rate: 24000,
      bitrate: 128000,
      format: 'mp3',
      channel: 1,
    });
  });
  it('trunca o texto em 5000 caracteres', () => {
    const body = buildMinimaxBody('a'.repeat(6000), {
      voice: 'x',
      speed: 1,
      pitch: 0,
      vol: 1,
    });
    expect((body.text as string).length).toBe(5000);
  });
});

describe('parseMinimaxResponse', () => {
  it('ok quando status_code === 0 e há áudio hex', () => {
    const r = parseMinimaxResponse({ base_resp: { status_code: 0 }, data: { audio: 'ffd8' } });
    expect(r).toEqual({ ok: true, hex: 'ffd8' });
  });
  it('erro quando status_code != 0 (com a mensagem da MiniMax)', () => {
    const r = parseMinimaxResponse({ base_resp: { status_code: 1004, status_msg: 'auth' } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('auth');
  });
  it('erro quando falta o áudio ou a resposta é inválida', () => {
    expect(parseMinimaxResponse({ base_resp: { status_code: 0 } }).ok).toBe(false);
    expect(parseMinimaxResponse(null).ok).toBe(false);
  });
});

describe('hexToBytes', () => {
  it('decodifica hex par e válido', () => {
    expect(Array.from(hexToBytes('ffd8c0'))).toEqual([255, 216, 192]);
    expect(hexToBytes('').length).toBe(0);
  });
  it('lança em hex inválido (ímpar ou char fora de 0-9a-f)', () => {
    expect(() => hexToBytes('abc')).toThrow();
    expect(() => hexToBytes('zz')).toThrow();
  });
});
