# ADR 0008 — Campanha de vendas reusa os top criativos vencedores

- **Status:** Accepted
- **Data:** 2026-06-21
- **Onda:** 5

## Contexto

Depois que campanhas de tráfego rodam e a análise (Onda 4) acumula compras por criativo, queremos
escalar para **vendas** (OUTCOME_SALES) sem recomeçar do zero. Gerar novos criativos jogaria fora o
sinal já conquistado e gastaria com imagem/curadoria à toa. A Meta v25 tem gotchas específicos de
OUTCOME_SALES que, se ignorados, fazem a criação falhar ou otimizar pelo evento errado.

## Decisão

A skill `create-sales-<cliente>-campaign` **reusa** os criativos existentes em vez de criar novos:
`selectTopCreatives` ordena por **compras** (desc), desempata por **menor gasto** e exige
`meta_creative_id` (só dá para reusar o que existe na Meta); pega o top-N (default 3). O plano
(`buildSalesPlan`) é OUTCOME_SALES, **sempre PAUSED**, dentro do teto, e o ad_set:

- **omite `destination_type`** (a chave não existe no payload — gotcha v25);
- usa `promoted_object = { pixel_id, custom_event_type: 'PURCHASE' }` e `optimization_goal =
  OFFSITE_CONVERSIONS`;
- Advantage+ omite placements.

Cada `ads` aponta para o `creative_id` (Supabase) e o `meta_creative_id` existentes; persistência via
REST com upsert por chave natural (idempotente). A coluna `ad_sets.destination_type` fica `null`.

## Consequências

- **Positivas:** aproveita o aprendizado (criativos com compras comprovadas); mais barato e rápido;
  payload correto para v25 desde o início; idempotente.
- **Negativas / trade-offs:** depende de já existirem criativos com `meta_creative_id` e sinal de
  compra — sem isso a skill aborta (não inventa criativo); top-N é heurístico (compras, depois custo).
- **Riscos & mitigação:** atribuição de compra imperfeita → o critério é explícito e auditável no
  manifest (`reusedCreativeIds`); nasce PAUSED → nenhum gasto até ativação validada (ADR 0007).

## Alternativas consideradas

- **Gerar criativos novos para vendas** — rejeitado: descarta o sinal de performance e adiciona custo;
  o reuso é o caminho de escala natural.
- **Incluir `destination_type` "para garantir"** — rejeitado: quebra OUTCOME_SALES na Meta v25; a
  ausência da chave é intencional e testada (`'destination_type' in payload === false`).
