import { describe, expect, it, vi, beforeEach } from 'vitest';

const getClientBySlug = vi.fn();
const resolveClientConnection = vi.fn();
const enqueueJob = vi.fn();

vi.mock('../../services/clients', () => ({
  getClientBySlug: (...a: unknown[]) => getClientBySlug(...a),
  listClients: vi.fn(),
}));
vi.mock('../../services/connections', () => ({
  resolveClientConnection: (...a: unknown[]) => resolveClientConnection(...a),
}));
vi.mock('./agent-jobs', () => ({
  enqueueJob: (...a: unknown[]) => enqueueJob(...a),
}));

import { confirmAndEnqueue } from './chat-runner';

const client = { id: 'c-1', account_id: 'acc-1' };

beforeEach(() => {
  getClientBySlug.mockReset();
  resolveClientConnection.mockReset();
  enqueueJob.mockReset();
  enqueueJob.mockResolvedValue({ status: 'enqueued', jobId: 'job-1' });
});

describe('confirmAndEnqueue — resolução da conta Meta em jobs de campanha', () => {
  it('injeta meta_ad_account_id e enfileira quando há uma única conexão ativa', async () => {
    getClientBySlug.mockResolvedValue(client);
    resolveClientConnection.mockResolvedValue({ ok: true, metaAdAccountId: 'act_100' });

    const res = await confirmAndEnqueue({
      id: 'confirm-token-1',
      slug: 'create-traffic',
      args: { client_slug: 'cliente-exemplo' },
    });

    expect(res.job).toEqual({ status: 'enqueued', jobId: 'job-1' });
    expect(enqueueJob).toHaveBeenCalledTimes(1);
    const row = enqueueJob.mock.calls[0]![0] as { args: Record<string, string> };
    expect(row.args.meta_ad_account_id).toBe('act_100');
  });

  it('não enfileira e explica quando o cliente não tem conta ativa', async () => {
    getClientBySlug.mockResolvedValue(client);
    resolveClientConnection.mockResolvedValue({ ok: false, reason: 'no_active_connection' });

    const res = await confirmAndEnqueue({
      id: 'confirm-token-2',
      slug: 'create-traffic',
      args: { client_slug: 'cliente-exemplo' },
    });

    expect(res.job).toBeUndefined();
    expect(enqueueJob).not.toHaveBeenCalled();
    expect(res.reply).toContain('conta de anúncio ativa');
  });

  it('não enfileira e pede escolha quando há mais de uma conta ativa', async () => {
    getClientBySlug.mockResolvedValue(client);
    resolveClientConnection.mockResolvedValue({ ok: false, reason: 'ambiguous' });

    const res = await confirmAndEnqueue({
      id: 'confirm-token-3',
      slug: 'create-sales',
      args: { client_slug: 'cliente-exemplo' },
    });

    expect(res.job).toBeUndefined();
    expect(enqueueJob).not.toHaveBeenCalled();
    expect(res.reply).toContain('mais de uma');
  });

  it('não enfileira campanha sem cliente resolvido', async () => {
    const res = await confirmAndEnqueue({
      id: 'confirm-token-4',
      slug: 'create-traffic',
      args: {},
    });

    expect(res.job).toBeUndefined();
    expect(resolveClientConnection).not.toHaveBeenCalled();
    expect(enqueueJob).not.toHaveBeenCalled();
  });

  it('não resolve conexão para kinds que não são de campanha (ex.: analyze)', async () => {
    getClientBySlug.mockResolvedValue(client);

    const res = await confirmAndEnqueue({
      id: 'confirm-token-5',
      slug: 'analyze',
      args: { client_slug: 'cliente-exemplo' },
    });

    expect(resolveClientConnection).not.toHaveBeenCalled();
    expect(enqueueJob).toHaveBeenCalledTimes(1);
    const row = enqueueJob.mock.calls[0]![0] as { args: Record<string, string> };
    expect(row.args.meta_ad_account_id).toBeUndefined();
    expect(res.job).toEqual({ status: 'enqueued', jobId: 'job-1' });
  });
});
