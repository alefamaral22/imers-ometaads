# ADR 0021 — Tracking server-side num Cloudflare Worker, espelho NO-PII no Supabase

- **Status:** Accepted
- **Data:** 2026-06-22
- **Onda:** 10

## Contexto

As landing pages precisam medir conversões (pageview → purchase) e alimentar a otimização das
campanhas (Meta CAPI, GA4, Google Ads). Pixels puramente client-side são bloqueados por
ad-blockers/ITP e expõem tokens. Ao mesmo tempo, a regra transversal do projeto proíbe **PII em
logs e em `lp_events`** (SPEC §11) e exige RLS deny-by-default.

Forças em jogo: (1) coletar de um domínio próprio (`track.example.com`) resistente a bloqueio;
(2) nunca persistir PII no banco analítico; (3) ainda assim enviar dados hasheados às plataformas
(o Meta CAPI exige `em`/`ph` em SHA-256); (4) idempotência sob retry/duplicação com o pixel do
browser; (5) custo/latência baixos (beacon).

## Decisão

Usamos um **Cloudflare Worker** (`worker/track`) servindo `POST /e` em `track.example.com`, porque
roda na borda, é barato e compartilha o domínio raiz das LPs (first-party, resistente a bloqueio).

A fronteira de PII é explícita e tem três destinos distintos:

- **`public.lp_events` (Supabase, NO-PII):** `buildLpEventRow` enumera **apenas** as colunas
  permitidas (dimensões + flags `has_email`/`has_phone`). Upsert `on_conflict=event_id,
  merge-duplicates` → idempotente.
- **D1 (server-side):** registro operacional com **hashes** SHA-256 (nunca PII crua), `INSERT OR
  IGNORE` por `event_id` (PK) → idempotente.
- **Fan-out (Meta CAPI + GA4):** `em`/`ph` hasheados conforme a spec da Meta; `event_id` reusado
  para deduplicar com o pixel do browser. **Google Ads** é coberto por **importação de conversões
  do GA4** (`gclid` é repassado ao GA4) — evita um cliente Google Ads API (OAuth + developer token)
  no Worker.

A lógica fica **pura e testável** (`domain/` valida e monta linhas; `application/` orquestra e
constrói os descritores de fan-out); `infrastructure/` é só o glue Cloudflare (fetch handler, KV,
D1, REST, crypto). `country`/IP vêm do request na borda (não do cliente). Rate limit por IP em KV
(janela fixa). Persistência via **REST + `SUPABASE_SECRET_KEY`** (não MCP), como as skills (SPEC §10).

## Consequências

- **Positivas:** first-party resistente a bloqueio; PII nunca toca o banco analítico; idempotente;
  fan-out fail-safe (canal que falha não derruba a resposta); lógica coberta por testes no gate raiz.
- **Negativas / trade-offs:** Google Ads via GA4 (não direto) — atribução por importação, não pela
  Google Ads API. D1 guarda hashes (precisa de retenção/limpeza — fase posterior). Worker não é
  exercitado no gate (precisa de `wrangler`/bindings reais), como o runner Fly.
- **Riscos & mitigação:** SSRF/abuso de origem → allowlist de origem deny-by-default com boundary por
  ponto; flood → rate limit por IP; vazamento de segredo → `wrangler secret`, nunca no `.toml`;
  vazamento de PII → `buildLpEventRow` enumera colunas + teste que falha se surgir chave de PII.

## Alternativas consideradas

- **Pixel client-side puro (GTM/pixel da Meta):** rejeitado — bloqueável, expõe tokens, e mandaria
  PII para destinos sem o nosso controle de hash/flags.
- **Espelhar tudo (inclusive PII) no Supabase e filtrar depois:** rejeitado — viola "sem PII em
  `lp_events`" (SPEC §11); risco regulatório (LGPD/GDPR).
- **Cliente Google Ads API no Worker:** rejeitado para esta onda — OAuth + developer token + cota
  tornam-no pesado; a importação de conversões via GA4 entrega o mesmo resultado com `gclid`.
- **Rate limit em Upstash Redis (como o login):** adiado — KV do próprio Cloudflare evita um hop de
  rede extra na borda; Upstash pode ser adotado se precisarmos de contadores globais finos.
