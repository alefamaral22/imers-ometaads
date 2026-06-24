import { describe, expect, it } from 'vitest';
import { exitCodeToStatus, finishedPatch, parseClaimedJob, runningPatch } from '../domain/job.ts';
import { RunnerError } from '../domain/validation.ts';

const NOW = '2026-06-21T00:00:00.000Z';

describe('parseClaimedJob', () => {
  it('returns null when the RPC yields no job', () => {
    expect(parseClaimedJob(null)).toBeNull();
    expect(parseClaimedJob(undefined)).toBeNull();
  });

  it('returns null on an empty-queue "row of nulls" (PostgREST composite)', () => {
    // Fila vazia em produção: a RPC devolveu { id: null, skill: null, ... } em vez de JSON null.
    expect(parseClaimedJob({ id: null, skill: null, kind: null, args: null })).toBeNull();
    expect(parseClaimedJob({})).toBeNull();
  });

  it('parses a claimed row and defaults args to {}', () => {
    const job = parseClaimedJob({
      id: '11111111-1111-1111-1111-111111111111',
      skill: 'create-traffic-cliente-exemplo-campaign',
      kind: 'create',
      args: null,
    });
    expect(job).toEqual({
      id: '11111111-1111-1111-1111-111111111111',
      skill: 'create-traffic-cliente-exemplo-campaign',
      kind: 'create',
      args: {},
      accountId: null,
    });
  });

  it('parses account_id when present (Onda 12 multi-tenant)', () => {
    const job = parseClaimedJob({
      id: '11111111-1111-1111-1111-111111111111',
      skill: 'create-traffic-cliente-exemplo-campaign',
      kind: 'create',
      args: {},
      account_id: '22222222-2222-2222-2222-222222222222',
    });
    expect(job?.accountId).toBe('22222222-2222-2222-2222-222222222222');
  });

  it('throws when required columns are missing', () => {
    expect(() => parseClaimedJob({ id: 'x' })).toThrow(RunnerError);
  });
});

describe('exitCodeToStatus', () => {
  it('maps 0 to completed and non-zero to failed', () => {
    expect(exitCodeToStatus(0)).toBe('completed');
    expect(exitCodeToStatus(1)).toBe('failed');
    expect(exitCodeToStatus(137)).toBe('failed');
  });

  it('rejects non-integer codes', () => {
    expect(() => exitCodeToStatus(1.5)).toThrow(RunnerError);
  });
});

describe('status patches', () => {
  it('runningPatch marks running + started_at', () => {
    expect(runningPatch(NOW)).toEqual({ status: 'running', started_at: NOW });
  });

  it('finishedPatch(0) completes without error', () => {
    expect(finishedPatch(0, NOW)).toEqual({
      status: 'completed',
      exit_code: 0,
      finished_at: NOW,
    });
  });

  it('finishedPatch(non-zero) fails with a bounded error string', () => {
    const patch = finishedPatch(1, NOW, 'boom');
    expect(patch.status).toBe('failed');
    expect(patch.exit_code).toBe(1);
    expect(patch.error).toBe('boom');
  });

  it('truncates long error messages', () => {
    const patch = finishedPatch(1, NOW, 'x'.repeat(5000));
    expect((patch.error as string).length).toBe(2000);
  });
});
