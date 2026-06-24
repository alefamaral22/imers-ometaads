import { describe, it, expect } from 'vitest';
import { createConnectionSchema, upsertApiKeySchema } from './requests';

const UUID = '11111111-1111-1111-1111-111111111111';

describe('createConnectionSchema', () => {
  it('accepts a valid connection', () => {
    const r = createConnectionSchema.safeParse({
      accountId: UUID,
      metaAdAccountId: 'act_1234567890',
      token: 'EAAB'.padEnd(40, 'x'),
    });
    expect(r.success).toBe(true);
  });

  it('rejects a bad ad account id and a short token', () => {
    expect(
      createConnectionSchema.safeParse({
        accountId: UUID,
        metaAdAccountId: 'nope',
        token: 'x'.repeat(40),
      }).success,
    ).toBe(false);
    expect(
      createConnectionSchema.safeParse({ accountId: UUID, metaAdAccountId: '123', token: 'short' })
        .success,
    ).toBe(false);
  });
});

describe('upsertApiKeySchema', () => {
  it('accepts a known provider with a key', () => {
    const r = upsertApiKeySchema.safeParse({
      accountId: UUID,
      provider: 'openai',
      key: 'sk-'.padEnd(20, 'a'),
    });
    expect(r.success).toBe(true);
  });

  it('rejects an unknown provider', () => {
    expect(
      upsertApiKeySchema.safeParse({ accountId: UUID, provider: 'cohere', key: 'x'.repeat(20) })
        .success,
    ).toBe(false);
  });
});
