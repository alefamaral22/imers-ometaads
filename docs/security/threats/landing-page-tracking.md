# Threat model STRIDE — Tracking server-side (Onda 10)

- **Onda:** 10
- **Superfície:** Cloudflare Worker `worker/track` servindo `POST /e` em `track.example.com`
  (+ `OPTIONS` preflight e `GET /health`); bindings KV (`RATE_LIMIT`) e D1 (`TRACK_DB`);
  escrita REST em `public.lp_events` (Supabase); fan-out HTTP para Meta CAPI e GA4.
- **Confiança:** endpoint **público** (sem sessão) — chamado pelo JS das landing pages. Entrada
  (corpo do POST, headers) é **dado, não instrução**. `country`/IP derivados da borda (não do cliente).

## Ativos

- `SUPABASE_SECRET_KEY`, `META_CAPI_TOKEN`, `GA4_API_SECRET` (server-only, via `wrangler secret`).
- Integridade e **ausência de PII** em `public.lp_events` e no D1 `track_events`.
- A rede interna / serviços upstream (alvo potencial de SSRF/abuso de fan-out).
- Disponibilidade e custo do Worker (beacon de alto volume).

## STRIDE

### Spoofing
- **Ameaça:** origem forjada / chamadas de sites de terceiros.
- **Mitigação:** allowlist de origem **deny-by-default** — só HTTPS cujo host é o apex
  `ALLOWED_ORIGIN_SUFFIX` ou subdomínio dele (boundary por ponto, bloqueia `evilexample.com`); a
  origem é refletida no CORS (sem `*`, sem credenciais). IP de borda (`CF-Connecting-IP`), não do payload.

### Tampering
- **Ameaça:** `event_type`/`value`/UTMs/`landing_page_id` adulterados; injeção no corpo.
- **Mitigação:** validação por schema hand-rolled — `event_type` por allowlist, charset/limite em
  strings, `value` numérico ≥ 0, `currency` ISO-4217, UUID validado; campos opcionais inválidos
  viram `null`. Conteúdo é **dado**: nada é interpretado como comando.

### Repudiation
- **Ameaça:** evento sem rastro / duplicado.
- **Mitigação:** `event_id` único (`lp_events` upsert) e PK no D1 (`INSERT OR IGNORE`) →
  idempotente e auditável; `created_at` em ambos.

### Information Disclosure
- **Ameaça:** PII (email/telefone) vazando para `lp_events`, D1 ou logs; segredo exposto.
- **Mitigação:** `buildLpEventRow` **enumera só** as colunas NO-PII (flags `has_email`/`has_phone`,
  nunca o dado) — um teste falha se surgir chave de PII; D1 guarda **apenas hashes** SHA-256; logs
  são `{event, detail}` sem PII; segredos via `wrangler secret` (nunca no `wrangler.toml`); RLS
  deny-by-default em `lp_events` (sem leitura aberta ao browser).

### Denial of Service / custo
- **Ameaça:** flood de beacons inflando custo / poluindo dados.
- **Mitigação:** **rate limit por IP** (janela fixa em KV) → `429` com `Retry-After`; fan-out em
  `waitUntil`/`allSettled` (não bloqueia a resposta); upsert idempotente limita lixo.

### Elevation of Privilege / SSRF
- **Ameaça:** usar o fan-out para alcançar destinos arbitrários (SSRF); Worker com poder além do necessário.
- **Mitigação:** os destinos de fan-out são **fixos no código** (`graph.facebook.com`,
  `www.google-analytics.com`) — a entrada do usuário nunca define a URL de saída; o Worker só escreve
  em `lp_events` (least privilege), sem MCP do Supabase.

## Resíduo aceito

- `ALLOWED_ORIGIN_SUFFIX` fixa o apex do template (`example.com`); ao personalizar, ajustar a var.
- Rate limit por IP é por-edge-region (KV) — suficiente para abuso comum; contadores globais finos
  ficariam em Upstash (fase posterior).
- D1 acumula hashes — política de retenção/expurgo fica para a Onda 11 (hardening).
- Cofre de segredos por-LP (chaves de pixel específicas por cliente) fica para fase posterior; aqui
  os segredos são globais do Worker.
