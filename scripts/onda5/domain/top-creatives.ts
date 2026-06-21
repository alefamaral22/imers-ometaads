// Onda 5 — Seleção dos top criativos por compras (reuso na campanha de vendas). Pura/determinística.
// Critério: mais compras primeiro; empate → menor gasto (mais eficiente); empate → meta_creative_id
// (estável). Só entram criativos que existem na Meta (meta_creative_id presente) — não dá para reusar
// um criativo sem id na Meta.

export interface CreativePerformance {
  creative_id: string; // id no Supabase (public.creatives.id)
  meta_creative_id: string | null;
  purchases: number;
  spend_cents: number;
}

/** Ordena por desempenho e devolve os top-N reutilizáveis. n ≤ 0 → []. */
export function selectTopCreatives(items: CreativePerformance[], n: number): CreativePerformance[] {
  if (!Number.isInteger(n) || n <= 0) return [];
  const reusable = items.filter(
    (c) => typeof c.meta_creative_id === 'string' && c.meta_creative_id.length > 0,
  );
  const sorted = [...reusable].sort((a, b) => {
    if (b.purchases !== a.purchases) return b.purchases - a.purchases; // mais compras primeiro
    if (a.spend_cents !== b.spend_cents) return a.spend_cents - b.spend_cents; // menor gasto
    return (a.meta_creative_id ?? '').localeCompare(b.meta_creative_id ?? ''); // estável
  });
  return sorted.slice(0, n);
}
