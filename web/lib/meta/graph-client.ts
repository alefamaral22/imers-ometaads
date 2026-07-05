import 'server-only';
import { z } from 'zod';

export const META_GRAPH_API_VERSION = 'v21.0' as const;

export class MetaGraphError extends Error {
  constructor(
    public readonly endpoint: string,
    public readonly httpStatus: number,
    message: string,
  ) {
    super(message);
    this.name = 'MetaGraphError';
  }
}

const metaCampaignApiSchema = z.object({
  id: z.string(),
  name: z.string(),
  objective: z.string(),
  status: z.string(),
  daily_budget: z.string().optional(),
  lifetime_budget: z.string().optional(),
});
export type MetaCampaignApi = z.infer<typeof metaCampaignApiSchema>;

type FetchLike = typeof fetch;

function baseUrl(): string {
  return `https://graph.facebook.com/${META_GRAPH_API_VERSION}`;
}

/**
 * Lê campanhas de uma conta de anúncio (read-only). Payload da Meta é dado de fronteira — cada
 * item é validado por schema antes de voltar ao chamador. Pagina até um teto (evita função presa).
 */
export async function listCampaigns(
  adAccountId: string,
  token: string,
  fetchImpl: FetchLike = fetch,
): Promise<MetaCampaignApi[]> {
  const fields = 'id,name,objective,status,daily_budget,lifetime_budget';
  const results: MetaCampaignApi[] = [];
  let url: string | undefined = `${baseUrl()}/${adAccountId}/campaigns?fields=${fields}&limit=100`;
  let pages = 0;
  while (url && pages < 5) {
    const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new MetaGraphError(
        'campaigns',
        res.status,
        `Meta Graph API ${res.status} on campaigns: ${detail.slice(0, 500)}`,
      );
    }
    const json = (await res.json()) as { data?: unknown[]; paging?: { next?: string } };
    for (const raw of json.data ?? []) {
      results.push(metaCampaignApiSchema.parse(raw));
    }
    url = json.paging?.next;
    pages++;
  }
  return results;
}
