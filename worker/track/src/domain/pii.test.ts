import { describe, expect, it } from 'vitest';
import {
  isValidEmail,
  isValidPhone,
  normalizeEmail,
  normalizePhone,
  presenceFlags,
} from './pii.ts';

describe('email', () => {
  it('validates and normalizes', () => {
    expect(isValidEmail(' User@Example.com ')).toBe(true);
    expect(normalizeEmail(' User@Example.com ')).toBe('user@example.com');
  });
  it('rejects invalid / null', () => {
    expect(isValidEmail('nope')).toBe(false);
    expect(isValidEmail(null)).toBe(false);
    expect(isValidEmail('a@b')).toBe(false);
  });
});

describe('phone', () => {
  it('normalizes to digits only', () => {
    expect(normalizePhone('+55 (11) 99999-0000')).toBe('5511999990000');
  });
  it('validates length 7..15 digits', () => {
    expect(isValidPhone('+55 11 99999-0000')).toBe(true);
    expect(isValidPhone('123')).toBe(false);
    expect(isValidPhone(null)).toBe(false);
    expect(isValidPhone('1234567890123456')).toBe(false);
  });
});

describe('presenceFlags', () => {
  it('returns only booleans (never the data)', () => {
    const flags = presenceFlags('user@example.com', '123');
    expect(flags).toEqual({ hasEmail: true, hasPhone: false });
  });
});
