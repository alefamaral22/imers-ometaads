import { describe, expect, it } from 'vitest';
import { isTerminal, tickWatch, type WatchState } from './watch.ts';

const NOW = '2026-06-21T12:00:00.000Z';

function state(over?: Partial<WatchState>): WatchState {
  return { phase: 'watching', last_event_ts: null, last_narrated_milestone: null, ...over };
}

describe('tickWatch', () => {
  it('narrates the start once while the job runs (idempotent on re-tick)', () => {
    const first = tickWatch(state(), { jobStatus: 'running', latestEventTs: NOW, now: NOW });
    expect(first.nextPhase).toBe('watching');
    expect(first.narration?.milestone).toBe('watch-started');

    // Re-tick with the milestone already narrated → no duplicate narration.
    const second = tickWatch(state({ last_narrated_milestone: 'watch-started' }), {
      jobStatus: 'running',
      latestEventTs: NOW,
      now: NOW,
    });
    expect(second.narration).toBeNull();
  });

  it('moves watching → reviewing when the job completes', () => {
    const r = tickWatch(state(), { jobStatus: 'completed', latestEventTs: NOW, now: NOW });
    expect(r.nextPhase).toBe('reviewing');
    expect(r.narration?.milestone).toBe('job-completed');
  });

  it('moves to failed when the job fails', () => {
    const r = tickWatch(state(), { jobStatus: 'failed', latestEventTs: NOW, now: NOW });
    expect(r.nextPhase).toBe('failed');
    expect(r.narration?.kind).toBe('system');
  });

  it('progresses reviewing → notifying → done with one narration each', () => {
    const reviewing = tickWatch(state({ phase: 'reviewing' }), {
      jobStatus: 'completed',
      latestEventTs: NOW,
      now: NOW,
    });
    expect(reviewing.nextPhase).toBe('notifying');
    expect(reviewing.narration?.kind).toBe('opinion');

    const notifying = tickWatch(state({ phase: 'notifying' }), {
      jobStatus: 'completed',
      latestEventTs: NOW,
      now: NOW,
    });
    expect(notifying.nextPhase).toBe('done');
    expect(notifying.narration?.milestone).toBe('notified');
  });

  it('is terminal at done/failed and emits no narration', () => {
    const r = tickWatch(state({ phase: 'done' }), {
      jobStatus: 'completed',
      latestEventTs: NOW,
      now: NOW,
    });
    expect(r.narration).toBeNull();
    expect(isTerminal(r.nextPhase)).toBe(true);
  });

  it('advances cursor to the latest event ts', () => {
    const r = tickWatch(state(), { jobStatus: 'running', latestEventTs: NOW, now: NOW });
    expect(r.cursors.last_event_ts).toBe(NOW);
  });
});
