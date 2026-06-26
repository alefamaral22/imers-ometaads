# SPEC-017 — Painel de métricas na visão geral (estilo "Jarvis")

## Problema

A visão geral (`web/app/page.tsx`) só mostrava contagens (clientes, campanhas, pausadas, último
veredito). O operador pediu o painel de performance estilo HUD: cards KPI (gasto, impressões,
cliques, CTR/CPC/CPM, resultados, campanhas), "top campanhas por gasto" e gráficos de série temporal.
O design "Neural Core" (commit `9f59416`) aplicou o **tema**, mas não os **dados** — esta feature
preenche essa lacuna.

## Fonte da verdade

Tudo já existe no banco (nada de número fictício):

- `metric_snapshots` (1 linha por entidade/análise): `impressions`, `spend_cents`, `ctr`,
  `cpc_cents`, `cpm_cents`, `results`, `landing_page_views` — produzidas pela skill
  `funnel-analytics-*` (read-only na Meta).
- `analyses`: `client_id`, `window_stop`, `created_at` — cada análise é uma leitura num ponto no tempo.
- `campaigns`: `meta_campaign_id` → `name` para rotular as linhas.

## Decisões (porquê)

1. **KPIs = última análise por cliente.** Cada análise relê **as mesmas** campanhas; somar todas as
   análises multiplicaria o gasto. Agregamos só a análise mais recente de cada cliente da account.
2. **Cliques derivados de `spend/cpc`.** A Meta não devolve um inteiro de cliques estável em
   `metric_snapshots`; `cliques = round(spend_cents / cpc_cents)` é consistente com os outros campos e
   independe da escala do `ctr`. CTR/CPC/CPM agregados são recomputados a partir dos totais (média
   ponderada), não médias de médias.
3. **Gráficos = série por análise.** Cada análise vira um ponto (`window_stop ?? created_at`). Sem
   dependência de chart: SVG inline. Histórico curto hoje (poucas análises) — enche conforme os crons
   rodam.
4. **Escopo por account** (ADR 0031): a leitura passa pelo mesmo `clientScopeFilter`; nada cross-tenant.

## Comportamento com conta PAUSED

As campanhas nascem PAUSED (regra inviolável) e podem nunca ter gasto. Nesse caso os KPIs vêm
**zerados** — correto e honesto; o painel "ganha vida" quando houver gasto real. Sem placeholders.

## WhatsApp — resumo das campanhas de mensagem

Abaixo do card "Ativar Nexus", uma seção espelha o painel de WhatsApp do mockup: Campanhas WA,
Conversas iniciadas, Custo/conversa, Msgs/conversa, Gasto WA (+ % do gasto total) e a tabela por
campanha (gasto, conversas, custo/conv, respostas, msgs/conv, CTR).

- **Sinal de "é WhatsApp"**: o snapshot traz `conversations` (≠ null). Independe da string de objetivo.
- **Derivações**: `custo/conversa = gasto / conversas`; `msgs/conversa = respostas / conversas`
  (mesma matemática do mockup: 720/800 ≈ 0,9).
- **Coleta**: a skill `funnel-analytics` foi estendida (passo 3/4 do SKILL.md) para ler as ações de
  conversa (`messaging_conversation_started`, respostas) **só em campanhas de mensagem** e gravar
  `conversations`/`replies` em `metric_snapshots` (migration `20260625150000`, colunas aditivas/nullable).
- **Hoje**: a conta só tem campanhas `OUTCOME_TRAFFIC` → a seção mostra estado vazio até rodar uma
  campanha de WhatsApp. Sem dado fictício.

## Critérios de aceite

- `lint` + `typecheck` + `test` verdes; funções de agregação cobertas por unit (puro, sem I/O).
- Visão geral renderiza 8 KPIs, top campanhas por gasto e os 2 gráficos a partir de dados reais
  escopados por account, degradando para vazio quando o DB está indisponível.
