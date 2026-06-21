import { describe, expect, it } from 'vitest';
import { planTick } from './tick-plan.ts';

const NOW = '2026-06-21T12:00:00.000Z';

describe('planTick', () => {
  it('produces ≤1 narration row and a watch patch advancing the phase', () => {
    const plan = planTick({
      watchId: 'w1',
      sessionId: 's1',
      state: { phase: 'watching', last_event_ts: null, last_narrated_milestone: null },
      signals: { jobStatus: 'completed', latestEventTs: NOW, now: NOW },
    });
    expect(plan.narrationRow).not.toBeNull();
    expect(plan.narrationRow?.watch_id).toBe('w1');
    expect(plan.watchPatch.phase).toBe('reviewing');
    expect(plan.watchPatch.last_event_ts).toBe(NOW);
  });

  it('emits no narration row when nothing new happens (idempotent tick)', () => {
    const plan = planTick({
      watchId: 'w1',
      sessionId: null,
      state: { phase: 'done', last_event_ts: NOW, last_narrated_milestone: 'notified' },
      signals: { jobStatus: 'completed', latestEventTs: NOW, now: NOW },
    });
    expect(plan.narrationRow).toBeNull();
    expect(plan.watchPatch.phase).toBe('done');
  });
});
