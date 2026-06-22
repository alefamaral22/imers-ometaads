# worker/track — Tracking server-side (Onda 10)

Cloudflare Worker que serve `POST /e` em `track.example.com`, espelha um registro **NO-PII** em
`public.lp_events` (Supabase) e faz fan-out dos eventos para Meta CAPI e GA4 (Google Ads via
importação de conversões do GA4). Ver `docs/specs/SPEC-015-tracking.md` e `docs/adr/0021-*`.

## Arquitetura

- `src/domain/` — lógica pura, testada pelo gate raiz (`npm test`): validação de origem (CORS
  deny-by-default), parse/validação do payload, normalização de PII p/ hash, rate limit (janela
  fixa) e montagem da linha **NO-PII** de `lp_events`.
- `src/application/` — orquestração (`handleEvent`) e construção dos descritores de fan-out
  (CAPI/GA4), também puras/testadas.
- `src/infrastructure/` — glue Cloudflare: `worker.ts` (fetch handler), KV (rate limit), D1
  (registro server-side com hashes), REST do Supabase, SHA-256 via Web Crypto.

## Setup (deploy real — não exercitado no gate)

```bash
npm install                                   # instala wrangler + @cloudflare/workers-types
npx wrangler kv namespace create RATE_LIMIT   # cole o id no wrangler.toml
npx wrangler d1 create track                  # cole o database_id no wrangler.toml
npm run d1:apply                              # cria a tabela track_events

# Segredos (nunca no wrangler.toml):
npx wrangler secret put SUPABASE_SECRET_KEY
npx wrangler secret put META_CAPI_TOKEN       # opcional (Meta CAPI)
npx wrangler secret put GA4_API_SECRET        # opcional (GA4)

# Vars não-secretas: SUPABASE_URL, META_PIXEL_ID, GA4_MEASUREMENT_ID (no wrangler.toml).
npm run deploy
```

## Segurança

PII (email/telefone) **nunca** é persistida: `lp_events` guarda só flags `has_email`/`has_phone`;
o D1 guarda só hashes SHA-256; o Meta CAPI recebe `em`/`ph` hasheados (exigência da Meta). Origem
validada deny-by-default; rate limit por IP; segredos via `wrangler secret`. Threat model:
`docs/security/threats/landing-page-tracking.md`.
