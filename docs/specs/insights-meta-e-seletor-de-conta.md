# SPEC — Insights reais da Meta em campaign_insights + seletor de conta na Visão geral

- **Status:** Draft
- **Onda:** pós-super-admin (insights de campanha + seletor de conta na Visão geral)
- **ADR relacionado:** [0037](../adr/0037-insights-meta-e-seletor-de-conta-na-visao-geral.md)

## 1. Problema

Depois de sincronizar campanhas (ADR 0036), nenhum card da Visão geral (`/operacao`) mudava — o sync
só importava metadados (nome, objetivo, orçamento), nunca gasto/impressões/resultados. Além disso,
não havia como escolher UMA conta de anúncio específica na Visão geral e ver só os números dela; a
página sempre agrega tudo do escopo (account).

## 2. Objetivo (vertical slice)

1. **Sync passa a trazer insights reais** (`spend`, `impressions`, `clicks`, `ctr`, `cpc`, `cpm`,
   `actions` → `results`) via `GET /act_<id>/insights?level=campaign`, gravados em `campaign_insights`
   (nova tabela, 1 linha por campanha, upsert a cada sync).
2. **Seletor de conta de anúncio na Visão geral** (`AdAccountSelector`, client component): lista as
   contas conectadas; ao trocar, busca as métricas daquela conta e atualiza os cards de cima
   (Campanhas, Gasto, Resultados) sem recarregar a página. Opção "Todas as contas" volta ao agregado
   padrão (baseado em análises, como já era).
3. **Nexus ganha acesso a métricas reais e a todas as contas**: `get_campaigns` retorna as métricas de
   `campaign_insights` junto de cada campanha; nova tool `get_ad_accounts` lista todas as conexões
   Meta de todos os clientes cadastrados (escopo global da agência).

## 3. Contrato dos campos importados (insights)

Payload de `/insights` é dado de fronteira — validado por schema Zod antes de qualquer cálculo.

| Campo Meta        | Campo interno         | Nota                                                     |
| ------------------ | ---------------------- | --------------------------------------------------------- |
| `campaign_id`       | resolve `campaign_id` local | join por `meta_campaign_id` — nunca usa o id da Meta como FK direta |
| `spend`             | `spend_cents`           | string decimal → centavos (`round(valor * 100)`)          |
| `impressions`       | `impressions`           | inteiro                                                    |
| `clicks`            | `clicks`                | inteiro (vem direto da Meta aqui, não é derivado)          |
| `ctr`, `cpc`, `cpm`  | `ctr`, `cpc_cents`, `cpm_cents` | `cpc`/`cpm` em centavos; `ctr` é razão 0..1              |
| `actions[]`          | `results`               | soma dos `value` cujo `action_type` NÃO é `impression`, `link_click` ou `post_engagement` |

Campanhas sem insight na Meta (nunca rodaram, ou sem permissão `ads_read`) simplesmente não recebem
linha em `campaign_insights` — não é erro, é ausência de dado.

## 4. Endpoints novos

- `GET /api/data/ad-accounts` — lista `{ metaAdAccountId, label, clientId, status }[]` das conexões
  no escopo do operador (reusa `listConnections`, mesma regra de visibilidade: super_admin/socio veem
  todas, cliente_usuario só as suas).
- `GET /api/data/overview-metrics?metaAdAccountId=<id>` — devolve `{ metrics: OverviewMetrics }` para
  UMA conta, lendo `campaign_insights` das campanhas dessa conta (filtradas pelo escopo do operador).
  `series` sempre vazio (não há histórico em `campaign_insights`, só "estado atual").

## 5. Critérios de aceite

- Sincronizar uma conexão com campanhas ativas na Meta preenche `campaign_insights`; os cards da
  Visão geral com essa conta selecionada mostram gasto/impressões/resultados reais, sem precisar
  rodar uma análise.
- Trocar a conta no seletor atualiza os cards (Campanhas, Gasto, Resultados) automaticamente, sem
  reload de página. Escolher "Todas as contas" restaura o agregado por análise já existente.
- `cliente_usuario` só vê no seletor as contas de anúncio da própria account (mesma regra de
  `listConnections`); nunca vê conta de outro tenant.
- O Nexus, ao ser perguntado sobre métricas ou pedido para subir campanha, tem acesso (via
  `get_campaigns` com métricas + `get_ad_accounts`) a todos os clientes e contas cadastrados —
  não fica restrito a um único tenant.
- Erro ao buscar insights (ex.: token sem `ads_read`) não impede o sync de metadados de completar.

## 6. Fora de escopo

- Série histórica de insights por conta (só "estado atual"; histórico continua sendo
  `metric_snapshots`, produzido pela skill `funnel-analytics`).
- Insights em nível de ad set/ad (só campanha, mesmo nível do sync de metadados do ADR 0036).
- Atualização automática/periódica dos insights (permanece manual, pelo botão "Sincronizar
  campanhas" já existente).
