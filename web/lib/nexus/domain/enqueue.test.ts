import { describe, expect, it } from 'vitest';
import { buildPendingAction } from './confirmation';
import { buildAgentJobRow } from './enqueue';

describe('buildAgentJobRow', () => {
  it('maps a confirmed pending action to an agent_jobs row (status pending, requested_by nexus)', () => {
    const pending = buildPendingAction('analyze', { client_slug: 'cliente-exemplo' }, { id: 't' })!;
    const row = buildAgentJobRow('client-uuid', pending);
    expect(row).toMatchObject({
      client_id: 'client-uuid',
      skill: 'funnel-analytics-cliente-exemplo-campaign',
      kind: 'analyze',
      status: 'pending',
      requested_by: 'nexus',
    });
    expect(row.args).toEqual({ client_slug: 'cliente-exemplo' });
    expect(row.landing_page_id).toBeNull();
  });

  it('carries landing_page_id when present in args', () => {
    const pending = buildPendingAction(
      'publish-landing',
      { landing_page_id: 'lp-1' },
      { id: 't' },
    )!;
    const row = buildAgentJobRow(null, pending);
    expect(row.landing_page_id).toBe('lp-1');
    expect(row.kind).toBe('landing_publish');
  });
});
