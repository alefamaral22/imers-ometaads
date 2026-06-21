# ADR 0025 — Funil de conversão de 7 etapas como modelo de análise

- **Status:** Accepted
- **Data:** 2026-06-21
- **Onda:** 4

## Contexto

A análise de performance precisa explicar **onde** o investimento converte ou vaza, não só reportar
métricas soltas (CTR, CPM, gasto). Um agregado plano ("CTR 1,2%, CPM R$30") não diz se o problema é o
criativo, a landing, o checkout ou o tracking. Precisamos de um modelo que (a) seja comparável entre
campanhas/objetivos, (b) localize o gargalo, e (c) seja determinístico/testável (a decisão não pode
depender do texto que a Meta devolve — isso seria superfície de prompt injection).

## Decisão

Modelamos a conversão como um **funil de 7 etapas** na ordem canônica do enum `funnel_event_type`:
`impression → link_click → landing_page_view → view_content → add_to_cart → initiate_checkout →
purchase`. Para cada etapa gravamos `count`, `cost_per_event_cents`, e duas taxas de conversão:
`cvr_from_prev` (vs. etapa anterior) e `cvr_from_top` (vs. impressões). O topo não tem razão (null);
divisão por zero vira **null**, nunca NaN/Infinity. Só `purchase` carrega `value_cents` (receita).

O **diagnóstico** é uma função pura que **cruza ≥2 métricas** ancorada no **north-star do objetivo**
(traffic→link_click, sales→purchase, leads→view_content) e emite `analysis_findings` com severidade
(`positive/info/warning/critical`), evidência, ação recomendada e confiança. O **veredito agregado**
(`healthy/watch/underperforming/learning/no_data/error`) deriva do volume e da pior severidade. Tudo
vive em `scripts/onda4/` (domain/application), coberto por testes Vitest; a skill só achata os insights
da Meta para a fronteira e persiste.

## Consequências

- **Positivas:** o gargalo fica localizável por etapa; diagnóstico explicável e auditável; lógica
  determinística e testável (sem rede no unit); reaproveitável pelas ondas 5 (ativação) e 7 (Nexus).
- **Negativas / trade-offs:** os limiares (`THRESHOLDS`) são heurísticos e **tunáveis** — não são
  verdades absolutas; um produto sem add_to_cart/checkout (lead gen) usa só o prefixo do funil.
- **Riscos & mitigação:** insights ausentes/zerados → `null` e veredito `no_data`/`learning` em vez de
  conclusões falsas; mudança de enum exige migration (`ALTER TYPE`).

## Alternativas consideradas

- **Reportar métricas planas sem funil** — rejeitado: não localiza o gargalo nem permite diagnóstico
  cruzando etapas.
- **Diagnóstico via LLM livre sobre o JSON da Meta** — rejeitado: não-determinístico, não-testável e
  superfície de prompt injection (o texto da Meta viraria instrução). O LLM orquestra a leitura; a
  decisão é TS puro.
