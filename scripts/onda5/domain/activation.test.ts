import { describe, expect, it } from 'vitest';
import { activationPatch, evaluateActivation, type ActivationContext } from './activation.ts';

function ctx(over?: Partial<ActivationContext>): ActivationContext {
  return {
    clientId: 'client-1',
    capCents: 5000,
    campaign: {
      id: 'camp-1',
      client_id: 'client-1',
      meta_campaign_id: 'meta-camp-1',
      status: 'PAUSED',
      daily_budget_cents: null,
    },
    adSets: [
      { id: 'as-1', meta_ad_set_id: 'meta-as-1', status: 'PAUSED', daily_budget_cents: 3000 },
    ],
    ...over,
  };
}

describe('evaluateActivation', () => {
  it('allows when every check passes', () => {
    const d = evaluateActivation(ctx());
    expect(d.allowed).toBe(true);
    expect(d.reasons).toEqual([]);
    expect(Object.values(d.checks).every(Boolean)).toBe(true);
  });

  it('denies when the campaign belongs to another client', () => {
    const d = evaluateActivation(ctx({ clientId: 'other' }));
    expect(d.allowed).toBe(false);
    expect(d.checks.right_client).toBe(false);
  });

  it('denies when the campaign is not currently PAUSED (default-deny on doubt)', () => {
    const d = evaluateActivation(
      ctx({
        campaign: {
          id: 'c',
          client_id: 'client-1',
          meta_campaign_id: 'm',
          status: 'ACTIVE',
          daily_budget_cents: null,
        },
      }),
    );
    expect(d.allowed).toBe(false);
    expect(d.checks.currently_paused).toBe(false);
  });

  it('denies when the budget cap is 0', () => {
    const d = evaluateActivation(ctx({ capCents: 0 }));
    expect(d.allowed).toBe(false);
    expect(d.checks.cap_positive).toBe(false);
  });

  it('denies when an ad set budget exceeds the cap', () => {
    const d = evaluateActivation(
      ctx({
        adSets: [{ id: 'as', meta_ad_set_id: 'm', status: 'PAUSED', daily_budget_cents: 9999 }],
      }),
    );
    expect(d.allowed).toBe(false);
    expect(d.checks.budget_within_cap).toBe(false);
  });

  it('denies when no budget is defined anywhere (ambiguous)', () => {
    const d = evaluateActivation(
      ctx({
        adSets: [{ id: 'as', meta_ad_set_id: 'm', status: 'PAUSED', daily_budget_cents: null }],
      }),
    );
    expect(d.allowed).toBe(false);
    expect(d.checks.budget_within_cap).toBe(false);
  });

  it('denies when there is no meta_campaign_id', () => {
    const d = evaluateActivation(
      ctx({
        campaign: {
          id: 'c',
          client_id: 'client-1',
          meta_campaign_id: null,
          status: 'PAUSED',
          daily_budget_cents: 1000,
        },
      }),
    );
    expect(d.allowed).toBe(false);
    expect(d.checks.has_meta_id).toBe(false);
  });
});

describe('activationPatch', () => {
  it('flips status to ACTIVE', () => {
    expect(activationPatch()).toEqual({ status: 'ACTIVE' });
  });
});
