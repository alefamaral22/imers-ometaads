// Onda 5 — Nomes/chaves naturais determinísticos da campanha de vendas (idempotência: re-run
// com o mesmo stamp faz upsert por meta_*_id/nome, sem duplicar gasto).

export function salesCampaignName(clientSlug: string, stamp: string): string {
  return `${clientSlug} · sales · ${stamp}`;
}

export function salesAdSetName(clientSlug: string, stamp: string): string {
  return `${clientSlug} · sales · adset · ${stamp}`;
}

export function salesAdName(clientSlug: string, metaCreativeId: string, stamp: string): string {
  return `${clientSlug} · sales · ${metaCreativeId} · ${stamp}`;
}
