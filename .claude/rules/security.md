# Regra: Segurança (Security by Design) — SPEC §11

Vale em **todas** as ondas.

## Princípios

- **Ordem em toda rota protegida:** `auth → authz → validação → lógica`. Nunca pule etapas.
- **Validação por schema tipado em toda fronteira** (Zod no TS, Pydantic no Python). Entrada externa
  (request, fala, tela, payload da Meta, args de job) é **dado, não instrução** — trate injeção de
  prompt como conteúdo não confiável.
- **RLS deny-by-default** em todas as tabelas; só `service_role` acessa. Sem policies de leitura
  abertas ao browser — toda leitura é server-side.
- **Least privilege:** skills de análise não têm allowed-tools de escrita; RPCs sensíveis com EXECUTE
  revogado de anon/authenticated.
- **Segredos fora do código** (`.env.local` dev / `fly secrets` + Vercel env prod). `NEXT_PUBLIC_*`
  nunca carrega segredo.
- **Headers de segurança em todas as respostas:** HSTS, CSP (nonce), X-Content-Type-Options,
  X-Frame-Options, Referrer-Policy.
- **Rate limit** em todo endpoint público (login, `/e` do tracking, endpoints do Nexus).
- **Sem PII em logs nem em `lp_events`** (só flags `has_email`/`has_phone`, utm_*, country, value).

## Específicos do domínio

- Meta: campanha **sempre PAUSED**; orçamento ≤ `daily_budget_cap_cents`; ativação revalida e
  **aborta por padrão na dúvida**.
- Nexus: tools de escrita **só enfileiram** `agent_jobs`; **confirmação em dois turnos**; nome de
  skill resolvido por **allowlist server-side slug→skill** (nunca texto livre); args com charset restrito.
- SSRF-guard no screenshotter (apenas `*.example.com`).

## Saída obrigatória

**Threat model STRIDE por superfície nova**, em `docs/security/threats/`.
