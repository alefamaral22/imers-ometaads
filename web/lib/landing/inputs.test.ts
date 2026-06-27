import { describe, it, expect } from 'vitest';
import {
  landingInputsCopySchema,
  landingInputsManifestSchema,
  normalizeCopy,
  buildInputsManifest,
  manifestPath,
  imagePath,
  safeFileName,
  MAX_IMAGES,
} from './inputs';

describe('landingInputsCopySchema', () => {
  it('aceita copy parcial', () => {
    expect(landingInputsCopySchema.parse({ headline: 'Olá' })).toEqual({ headline: 'Olá' });
  });
  it('rejeita chave desconhecida (strict)', () => {
    expect(landingInputsCopySchema.safeParse({ foo: 'bar' }).success).toBe(false);
  });
  it('rejeita headline acima do limite', () => {
    expect(landingInputsCopySchema.safeParse({ headline: 'x'.repeat(161) }).success).toBe(false);
  });
});

describe('normalizeCopy', () => {
  it('descarta strings vazias e retorna undefined se nada sobra', () => {
    expect(normalizeCopy({ headline: '', subheadline: '' })).toBeUndefined();
  });
  it('mantém só os campos preenchidos', () => {
    expect(normalizeCopy({ headline: 'A', ctaLabel: '' })).toEqual({ headline: 'A' });
  });
  it('undefined entra, undefined sai', () => {
    expect(normalizeCopy(undefined)).toBeUndefined();
  });
});

describe('buildInputsManifest', () => {
  const now = '2026-06-27T00:00:00.000Z';
  it('inclui copy normalizada e imagens, e valida pelo schema', () => {
    const m = buildInputsManifest(
      { headline: 'Vende mais' },
      [{ url: 'https://x/y.png', name: 'y.png' }],
      now,
    );
    expect(m.version).toBe(1);
    expect(m.copy).toEqual({ headline: 'Vende mais' });
    expect(m.images).toHaveLength(1);
    expect(landingInputsManifestSchema.parse(m)).toEqual(m);
  });
  it('omite copy quando vazia', () => {
    const m = buildInputsManifest({ headline: '' }, [], now);
    expect(m.copy).toBeUndefined();
    expect('copy' in m).toBe(false);
  });
});

describe('paths e nomes', () => {
  it('manifestPath e imagePath usam o token', () => {
    expect(manifestPath('tok')).toBe('tok/manifest.json');
    expect(imagePath('tok', 2, 'webp')).toBe('tok/img-2.webp');
  });
  it('safeFileName remove path e charset perigoso', () => {
    expect(safeFileName('../../etc/pa ss;wd.png')).toBe('pa ss_wd.png');
    expect(safeFileName('C:\\\\users\\\\foto.JPG')).toBe('foto.JPG');
  });
  it('MAX_IMAGES é 8', () => {
    expect(MAX_IMAGES).toBe(8);
  });
});
