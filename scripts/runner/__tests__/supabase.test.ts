import { describe, expect, it, vi } from 'vitest';
import {
  claimAgentJob,
  insertAgentEvent,
  patchAgentJob,
  readRunnerConfig,
  type RunnerConfig,
} from '../infrastructure/supabase.ts';
import { RunnerError } from '../domain/validation.ts';

const cfg: RunnerConfig = {
  url: 'https://ref.supabase.co',
  secretKey: 'service-key',
  worker: 'runner-1',
};

interface Call {
  url: string;
  init: RequestInit;
}

function fakeFetch(body: unknown, init?: { ok?: boolean; status?: number }) {
  const calls: Call[] = [];
  const fn = vi.fn(async (url: unknown, reqInit: unknown) => {
    calls.push({ url: String(url), init: (reqInit ?? {}) as RequestInit });
    return {
      ok: init?.ok ?? true,
      status: init?.status ?? 200,
      json: async () => body,
      text: async () => JSON.stringify(body),
    } as unknown as Response;
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

describe('readRunnerConfig', () => {
  it('reads url/secret and derives a worker id', () => {
    const c = readRunnerConfig({
      SUPABASE_URL: 'https://ref.supabase.co/',
      SUPABASE_SECRET_KEY: 'k',
      FLY_MACHINE_ID: 'm-123',
    } as NodeJS.ProcessEnv);
    expect(c.url).toBe('https://ref.supabase.co');
    expect(c.worker).toBe('m-123');
  });

  it('throws when a secret is missing', () => {
    expect(() => readRunnerConfig({} as NodeJS.ProcessEnv)).toThrow();
  });
});

describe('claimAgentJob', () => {
  it('POSTs to rpc/claim_agent_job with the worker and parses the row', async () => {
    const { fn, calls } = fakeFetch({
      id: 'job-1',
      skill: 'lista-de-clientes',
      kind: 'analyze',
      args: {},
    });
    const job = await claimAgentJob(cfg, fn);
    expect(job?.id).toBe('job-1');
    expect(calls[0]?.url).toBe('https://ref.supabase.co/rest/v1/rpc/claim_agent_job');
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ worker: 'runner-1' });
  });

  it('returns null when there is no pending job', async () => {
    const { fn } = fakeFetch(null);
    expect(await claimAgentJob(cfg, fn)).toBeNull();
  });

  it('tolerates an array-wrapped composite (PostgREST version differences)', async () => {
    const wrapped = fakeFetch([{ id: 'job-2', skill: 'lista-de-clientes', kind: 'analyze' }]);
    expect((await claimAgentJob(cfg, wrapped.fn))?.id).toBe('job-2');
    const empty = fakeFetch([]);
    expect(await claimAgentJob(cfg, empty.fn)).toBeNull();
  });

  it('throws on a non-ok response', async () => {
    const { fn } = fakeFetch({ message: 'denied' }, { ok: false, status: 403 });
    await expect(claimAgentJob(cfg, fn)).rejects.toThrow(RunnerError);
  });
});

describe('patchAgentJob', () => {
  it('PATCHes the job by id', async () => {
    const { fn, calls } = fakeFetch(null);
    await patchAgentJob(cfg, 'job-1', { status: 'running' }, fn);
    expect(calls[0]?.url).toBe('https://ref.supabase.co/rest/v1/agent_jobs?id=eq.job-1');
    expect(calls[0]?.init.method).toBe('PATCH');
  });
});

describe('insertAgentEvent', () => {
  it('POSTs an event row to agent_events', async () => {
    const { fn, calls } = fakeFetch(null);
    await insertAgentEvent(
      cfg,
      {
        run_id: 'job-1',
        agent_name: null,
        agent_type: 'system',
        event_type: 'start',
        tool_name: null,
        payload: {},
      },
      fn,
    );
    expect(calls[0]?.url).toBe('https://ref.supabase.co/rest/v1/agent_events');
    expect(calls[0]?.init.method).toBe('POST');
  });
});
