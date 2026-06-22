# SPEC-015 — Tracking server-side (Cloudflare Worker)

- **Onda:** 10
- **Status:** Ready

## Objetivo

Coletar eventos de conversão das landing pages (`<subdomain>.example.com`) num endpoint
server-side (`track.example.com/e`), espelhar um registro **NO-PII** em `public.lp_events`
(Supabase) e fazer **fan-out** dos eventos para as plataformas de anúncio (Meta CAPI, GA4 —
e, por importação de conversões do GA4, Google Ads). O north-star: medir cada conversão **sem
vazar PII** para o banco analítico e sem depender de pixel client-side bloqueável.

## Contratos / modelo de dados

### Tabela (já existe — SPEC §6, Onda 1)

`public.lp_events` (append-only, NO-PII): `event_id` (text, **unique** → idempotência),
`landing_page_id` (uuid, FK set null), `event_type`, `utm_source/medium/campaign/term/content`,
`country`, `value` (numeric, em unidades da moeda), `currency`, `has_email`/`has_phone` (bool,
**flags** — nunca o dado), `created_at`. RLS deny-by-default; escrita só pelo `service_role`.

### Payload de entrada (`POST /e`, JSON)

```jsonc
{
  "event_id": "a1b2c3d4e5",          // idempotência; charset [A-Za-z0-9_-]{8,128}
  "event_type": "purchase",          // pageview|view_content|add_to_cart|initiate_checkout|lead|purchase
  "landing_page_id": "<uuid>",       // opcional
  "utm": { "source": "fb", "medium": "cpc", "campaign": "x" }, // ou flat utm_source=...
  "value": 49.9,                      // opcional, ≥ 0
  "currency": "BRL",                  // opcional, ISO-4217 (3 letras)
  "event_source_url": "https://lp.example.com/...",
  "ga_client_id": "GA1.1.123.456",   // opcional (cookie _ga); fallback = event_id
  "fbp": "...", "fbc": "...", "gclid": "...", // ids de clique, opcionais
  "user": { "email": "...", "phone": "..." }  // PII — só p/ hash CAPI; NUNCA persistida
}
```

`country` e `client_ip` **não** vêm do payload — são derivados do request na borda Cloudflare
(`CF-IPCountry` / `CF-Connecting-IP`), pois o cliente não é confiável.

### Saída

- `204` em preflight `OPTIONS` (origem permitida).
- `202 { "ok": true }` quando aceito (espelho gravado; fan-out em background via `waitUntil`).
- `400` payload inválido; `403` origem não permitida; `404` rota desconhecida; `429` rate limit
  (com `Retry-After`).

## Comportamento

1. **Origem (CORS, deny-by-default):** só HTTPS cujo host é o apex `ALLOWED_ORIGIN_SUFFIX` ou um
   subdomínio dele (boundary por ponto — bloqueia `evilexample.com`). Reflete a origem validada em
   `Access-Control-Allow-Origin` (sem `*`, sem credenciais).
2. **Rate limit por IP:** janela fixa em KV (`RATE_LIMIT_MAX` por `RATE_LIMIT_WINDOW_MS`). Estourou
   → `429`.
3. **Validação:** schema hand-rolled (dado, não instrução); strings com charset/limite; `event_type`
   por allowlist; campos opcionais inválidos viram `null` (não rejeitam o evento).
4. **Espelho NO-PII (awaited):** `buildLpEventRow` monta **apenas** as colunas de `lp_events`
   (flags, nunca o dado) e faz upsert `on_conflict=event_id, merge-duplicates` → idempotente.
5. **Background (`waitUntil`, fail-safe):** hash SHA-256 de email/telefone normalizados; gravação
   server-side em D1 (`INSERT OR IGNORE` por `event_id`, só hashes — nunca PII crua); fan-out
   `Promise.allSettled` p/ Meta CAPI + GA4. Falha de canal **não** derruba a resposta.

**Idempotência:** `event_id` é único em `lp_events` (upsert) e PK no D1 (`INSERT OR IGNORE`); o mesmo
`event_id` também deduplica o evento do browser-pixel no Meta CAPI. Re-enviar não duplica.

## Segurança

- **Ordem:** origem (authz de borda) → rate limit → validação → lógica.
- **PII:** `lp_events` e D1 nunca guardam email/telefone crus — só flags (`lp_events`) e hashes
  SHA-256 (D1 + CAPI, conforme exige a Meta). Nenhuma PII em log (logs são `{event, detail}` sem dado).
- **Least privilege:** Worker só escreve em `lp_events` (sem leitura aberta ao browser; RLS fechada).
- **Segredos:** `SUPABASE_SECRET_KEY`, `META_CAPI_TOKEN`, `GA4_API_SECRET` via `wrangler secret`
  (nunca em `wrangler.toml`). Chaves de cookie/storage da LP usam prefixo neutro `lp_*`.
- Threat model STRIDE: `docs/security/threats/landing-page-tracking.md`.

## Critérios de aceite

- [ ] `POST /e` valida origem (`403` fora de `*.example.com`), grava `lp_events` e responde `202`.
- [ ] `lp_events` **sem PII** — só flags/dimensões (garantido por `buildLpEventRow` + teste).
- [ ] Rate limit por IP retorna `429` com `Retry-After`.
- [ ] Re-enviar o mesmo `event_id` não duplica (upsert + `INSERT OR IGNORE`).
- [ ] Fan-out Meta CAPI/GA4 é best-effort (não bloqueia/derruba a resposta).
- [ ] `lint` + `typecheck` + `test` verdes.
