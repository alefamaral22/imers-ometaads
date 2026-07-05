# 0037 — Insights reais da Meta em campaign_insights + seletor de conta na Visão geral

- **Status:** Accepted
- **Data:** 2026-07-06
- **Onda:** pós-super-admin (insights de campanha + seletor de conta na Visão geral)
- **Contexto relacionado:** ADR 0032 (leitura Meta ao vivo via job), ADR 0035 (token por tenant),
  ADR 0036 (sync síncrono de metadados de campanha no dashboard).

## Contexto

Depois do ADR 0036, sincronizar campanhas trazia metadados (nome, objetivo, orçamento) para
`campaigns`, mas nenhum card da Visão geral (`/operacao`) mudava — o operador via "7 campanhas
sincronizadas" e zero números novos. Investigação: os cards da Visão geral (`getOverviewMetrics`)
leem de `metric_snapshots`, uma tabela alimentada exclusivamente pela skill `funnel-analytics`
(runner headless, atrelada a `analysis_id`). O sync do dashboard nunca chamava `/insights` da Meta
nem escrevia ali — só metadados de campanha, que não têm gasto/impressões/resultados.

Separadamente, o operador pediu um seletor de conta de anúncio na Visão geral: hoje a página agrega
TODAS as campanhas do escopo (account) num só bloco de KPIs; não há como isolar "essa conta
específica" e ver os números mudarem ao trocar.

## Decisão

1. **Nova tabela `campaign_insights`** (1 linha por `campaign_id`, upsert a cada sync) guarda o
   "estado atual" de métricas (spend_cents, impressions, clicks, results, ctr, cpc_cents, cpm_cents,
   synced_at). É deliberadamente separada de `metric_snapshots`: esta é histórico por análise
   (`analysis_id`), aquela é sempre a última leitura, sem histórico. Não substituem uma à outra —
   `metric_snapshots` continua sendo a fonte de verdade das análises/funil; `campaign_insights` é só
   para os cards responderem sem depender de uma análise ter rodado.

2. **`campaigns` ganha `meta_ad_account_id`** (nullable, `text`) — sem isso não há como filtrar
   campanhas/insights por conta de anúncio no seletor. Preenchido pelo sync (ADR 0036) com o
   `meta_ad_account_id` da conexão usada.

3. **O sync de campanhas (ADR 0036) passa a também chamar `/insights`** (`level=campaign`,
   `date_preset=maximum`) e fazer upsert em `campaign_insights`, na mesma chamada síncrona (sem job).
   Falha ao buscar insights (ex.: token sem permissão de `ads_read`) **não aborta o sync de
   metadados** — é best-effort: os metadados já importados continuam válidos mesmo sem números.

4. **Seletor de conta na Visão geral é um novo endpoint + client component**, não uma mudança na
   página server component principal. `GET /api/data/ad-accounts` lista as contas conectadas (do
   escopo); `GET /api/data/overview-metrics?metaAdAccountId=...` devolve os KPIs dessa conta
   específica, lendo `campaign_insights`. O componente `AdAccountSelector` troca o estado local dos
   cards (`LiveOpsConsole`) via callback — sem recarregar a página.

5. **`get_campaigns` do Nexus passa a incluir as métricas de `campaign_insights`** e ganha uma tool
   nova `get_ad_accounts` (lista todas as `ad_account_connections` no escopo global da agência). O
   Nexus já lia tudo via `AGENCY_SCOPE`; isso só fecha a lacuna de ele não saber "quais contas de
   anúncio existem" nem "qual o gasto/resultado real" sem depender de uma análise.

## Consequências

**Positivas:** os cards da Visão geral respondem imediatamente após um sync bem-sucedido, sem
precisar rodar uma análise; o seletor dá visão por conta sem tocar a agregação por account que já
existia (`getOverviewMetrics`, baseada em análises, continua intacta e é o padrão "todas as contas");
o Nexus ganha dados reais de desempenho e visibilidade de todas as contas de anúncio da agência.

**Negativas / dívidas aceitas:** `campaign_insights` não guarda histórico — é sempre a última leitura
(um gráfico de série temporal por conta, como o que já existe agregado por análise, ficaria vazio
aqui; por design, `series: []` na resposta do novo endpoint). `date_preset=maximum` pode ficar lento
em contas com histórico muito longo — mesmo teto de paginação (5 páginas) do ADR 0036.

**Riscos & mitigação:** payload de `/insights` é dado de fronteira (Meta manda strings numéricas e
listas heterogêneas de `actions`) → validado por schema Zod item a item antes de qualquer soma
(`results` = soma das ações que não são impression/link_click/post_engagement); erro na chamada de
insights não propaga como falha do sync (evita que uma conta sem permissão de leitura de insight
bloqueie a importação de metadados, que é o valor já entregue pelo ADR 0036).

## Alternativas consideradas

- **Gravar insights em `metric_snapshots`** — rejeitada: essa tabela é semanticamente "produzida por
  uma análise" (tem `analysis_id` NOT NULL, é lida com a lógica de "última análise por cliente"). Usar
  fora desse contrato exigiria criar uma análise sintética por sync, confundindo o histórico real.
- **Seletor recarregando a página server component com um query param** — rejeitada: perderia a
  resposta imediata pedida ("ao trocar a conta, os dados devem atualizar automaticamente"); o padrão
  client-fetch já existe no projeto (`/api/data/ops-pulse`, polling do `LiveOpsConsole`).
