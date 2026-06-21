# ADR 0024 — Análise diária read-only por cron + resumo diário agregado

- **Status:** Accepted
- **Data:** 2026-06-21
- **Onda:** 4

## Contexto

O operador precisa de uma leitura diária e confiável do estado das campanhas, sem disparar nada manual
e **sem risco de mexer no gasto**. A análise é cara (lê muitas entidades na Meta) e roda no runner
headless. Precisamos separar a **coleta/diagnóstico por campanha** (escreve `analyses` e filhos) do
**resumo consolidado do dia** (uma linha por cliente/dia para o dashboard), e garantir que rodar de
novo não corrompa o estado.

## Decisão

Duas skills agendadas no `crontab` do runner (Onda 3), escalonadas:

1. `funnel-analytics-cliente-exemplo-campaign` (10:00 UTC) — **read-only na Meta**, gera 1 `analyses`
   (append-only) + snapshots + findings + funil por entidade. Cada execução é um registro histórico
   imutável (auditável); não há "upsert de análise".
2. `daily-summary-cliente-exemplo` (10:30 UTC, depois da análise) — lê as `analyses` do dia e faz
   **upsert idempotente** em `daily_summaries` por `(client_id, summary_date)` (gasto, resultados,
   ROAS, contagem de vereditos). Notificação por Telegram é **opcional** e degrada para log-only.

A análise é append-only (histórico) e o resumo é idempotente (uma linha por dia) — isso dá
rastreabilidade sem duplicação. Persistência só via REST + `SUPABASE_SECRET_KEY`.

## Consequências

- **Positivas:** estado diário sempre disponível ao dashboard; histórico de análises preservado;
  re-execução do resumo é segura (upsert); separação coleta↔consolidação mantém cada skill simples.
- **Negativas / trade-offs:** o resumo depende de a análise ter rodado antes (acoplamento por horário,
  não por evento — coerente com "planos só falam pelo banco"); janela de ~30min entre os dois crons.
- **Riscos & mitigação:** análise falha → resumo do dia fica vazio/parcial (degrada, não quebra);
  Telegram indisponível → log-only; fuso → tudo em UTC (TZ=UTC no `fly.toml`).

## Alternativas consideradas

- **Uma única skill que analisa e resume** — rejeitado: mistura append-only com idempotente e dificulta
  re-rodar só o resumo; viola a responsabilidade única.
- **Disparo por evento (webhook) em vez de cron** — rejeitado: não há superfície inbound no runner
  (ADR 0009); o agendamento por cron + leitura do banco respeita o desacoplamento entre planos.
