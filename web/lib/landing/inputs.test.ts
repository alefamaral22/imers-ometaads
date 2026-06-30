import { describe, it, expect } from 'vitest';
import {
  landingInputsCopySchema,
  landingInputsContextSchema,
  landingInputsManifestSchema,
  normalizeCopy,
  normalizeContext,
  whatsappHref,
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

describe('landingInputsContextSchema', () => {
  it('aceita contexto parcial', () => {
    expect(landingInputsContextSchema.parse({ priceCents: 19700 })).toEqual({ priceCents: 19700 });
  });
  it('rejeita cta com href não-https (anti-XSS)', () => {
    const bad = { cta: { kind: 'url', href: 'javascript:alert(1)' } };
    expect(landingInputsContextSchema.safeParse(bad).success).toBe(false);
  });
  it('rejeita chave desconhecida (strict)', () => {
    expect(landingInputsContextSchema.safeParse({ foo: 'bar' }).success).toBe(false);
  });
});

describe('normalizeContext', () => {
  it('descarta strings vazias mas mantém priceCents=0 e cta', () => {
    const out = normalizeContext({
      productName: '',
      priceCents: 0,
      cta: { kind: 'whatsapp', href: 'https://wa.me/5511999999999' },
    });
    expect(out).toEqual({
      priceCents: 0,
      cta: { kind: 'whatsapp', href: 'https://wa.me/5511999999999' },
    });
  });
  it('undefined entra, undefined sai; e {} vira undefined', () => {
    expect(normalizeContext(undefined)).toBeUndefined();
    expect(normalizeContext({})).toBeUndefined();
  });
});

describe('whatsappHref', () => {
  it('extrai os dígitos e monta o link wa.me', () => {
    expect(whatsappHref('+55 (11) 99999-9999')).toBe('https://wa.me/5511999999999');
  });
  it('rejeita números fora da faixa E.164 (8–15 dígitos)', () => {
    expect(whatsappHref('123')).toBeNull();
    expect(whatsappHref('1'.repeat(16))).toBeNull();
  });
});

describe('buildInputsManifest', () => {
  const now = '2026-06-27T00:00:00.000Z';
  it('inclui copy/contexto normalizados e imagens, e valida pelo schema', () => {
    const m = buildInputsManifest(
      { headline: 'Vende mais' },
      { priceCents: 19700, cta: { kind: 'url', href: 'https://loja.example.com' } },
      [{ url: 'https://x/y.png', name: 'y.png' }],
      now,
    );
    expect(m.version).toBe(1);
    expect(m.copy).toEqual({ headline: 'Vende mais' });
    expect(m.context).toEqual({
      priceCents: 19700,
      cta: { kind: 'url', href: 'https://loja.example.com' },
    });
    expect(m.images).toHaveLength(1);
    expect(landingInputsManifestSchema.parse(m)).toEqual(m);
  });
  it('omite copy e context quando vazios', () => {
    const m = buildInputsManifest({ headline: '' }, {}, [], now);
    expect('copy' in m).toBe(false);
    expect('context' in m).toBe(false);
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
