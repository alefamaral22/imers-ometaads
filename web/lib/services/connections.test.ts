import { describe, expect, it, vi, beforeEach } from 'vitest';

const selectRows = vi.fn();
vi.mock('../db/client', () => ({
  selectRows: (...args: unknown[]) => selectRows(...args),
  insertRows: vi.fn(),
}));

import { resolveClientConnection } from './connections';

const client = { id: 'c-1', account_id: 'acc-1' };

describe('resolveClientConnection', () => {
  beforeEach(() => selectRows.mockReset());

  it('usa a única conexão ativa (nível-conta, client_id nulo)', async () => {
    selectRows.mockResolvedValue([
      { meta_ad_account_id: 'act_100', client_id: null, status: 'active' },
    ]);
    await expect(resolveClientConnection(client)).resolves.toEqual({
      ok: true,
      metaAdAccountId: 'act_100',
    });
  });

  it('usa a única conexão ativa do próprio cliente', async () => {
    selectRows.mockResolvedValue([
      { meta_ad_account_id: 'act_200', client_id: 'c-1', status: 'active' },
    ]);
    await expect(resolveClientConnection(client)).resolves.toEqual({
      ok: true,
      metaAdAccountId: 'act_200',
    });
  });

  it('aborta quando não há conexão ativa viável', async () => {
    selectRows.mockResolvedValue([]);
    await expect(resolveClientConnection(client)).resolves.toEqual({
      ok: false,
      reason: 'no_active_connection',
    });
  });

  it('ignora conexões ativas de OUTRO cliente da mesma conta (não conta como viável)', async () => {
    selectRows.mockResolvedValue([
      { meta_ad_account_id: 'act_300', client_id: 'c-2', status: 'active' },
    ]);
    await expect(resolveClientConnection(client)).resolves.toEqual({
      ok: false,
      reason: 'no_active_connection',
    });
  });

  it('aborta (ambíguo) com mais de uma conexão ativa viável', async () => {
    selectRows.mockResolvedValue([
      { meta_ad_account_id: 'act_400', client_id: null, status: 'active' },
      { meta_ad_account_id: 'act_401', client_id: 'c-1', status: 'active' },
    ]);
    await expect(resolveClientConnection(client)).resolves.toEqual({
      ok: false,
      reason: 'ambiguous',
    });
  });
});
