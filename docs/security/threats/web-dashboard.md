# Threat model STRIDE — Dashboard web + auth (Onda 6, revisado na Onda 11)

- **Onda:** 6 (revisão 11)
- **Superfície:** `web/` Next.js 15 — `middleware.ts` (sessão + headers/CSP por nonce), API Hono em
  `app/api/[[...route]]`, auth (`/api/auth/*`), leituras `/api/data/*`, `/api/nexus/*`,
  `/api/landing/*`, `/api/health` (público).
- **Confiança:** acesso externo via browser. Só o operador autenticado vê dados; `service_role` é
  server-only. Entrada (request, corpo, params) é dado, não instrução.

## Ativos

- `AUTH_SECRET` (assina a sessão), `DASHBOARD_PASSWORD` (hash SHA-256), `SUPABASE_SECRET_KEY`
  (service_role, server-only), chaves do Nexus/Turnstile.
- Integridade da sessão e confidencialidade dos dados de cliente (RLS fechada ao browser).

## STRIDE

### Spoofing
- **Ameaça:** acessar rota protegida sem ser operador; forjar sessão.
- **Mitigação:** `middleware` faz auth (verifica cookie JWT assinado com `AUTH_SECRET`) → authz
  (`isAuthorizedOperator`) antes de tudo; cookie `httpOnly`+`secure`+`SameSite=Lax`. Só `/login`,
  `/api/auth/*` e `/api/health` são públicos.

### Tampering
- **Ameaça:** payload/param adulterado; injeção de prompt na fala/tela do Nexus.
- **Mitigação:** validação Zod em toda fronteira (`loginInputSchema`, `chat/confirm/tts/capture`,
  `editSection/startWatch`); conteúdo do Nexus é dado (escrita só enfileira, allowlist slug→skill);
  CSP por nonce restringe script inline.

### Repudiation
- **Ameaça:** ação sem rastro.
- **Mitigação:** mutações via skills geram `operation_logs`; narrações em `nexus_narrations`; o Nexus
  só enfileira `agent_jobs` (auditável).

### Information Disclosure
- **Ameaça:** leitura de tabela direto do browser; vazamento de segredo via `NEXT_PUBLIC_*`.
- **Mitigação:** RLS deny-by-default — toda leitura é server-side via `service_role`; `NEXT_PUBLIC_*`
  nunca carrega segredo; headers de segurança (HSTS, CSP, X-Content-Type-Options, X-Frame-Options,
  Referrer-Policy) em toda resposta.

### Denial of Service
- **Ameaça:** brute force no login; flood no Nexus.
- **Mitigação:** rate limit (Upstash) no `/api/auth/login` e em `/api/nexus/*` (antes da lógica);
  Turnstile opcional no login.

### Elevation of Privilege
- **Ameaça:** endpoint de leitura ou Nexus executando escrita/efeito além do permitido.
- **Mitigação:** leituras são read-only (serviços server-side); escrita do Nexus **só enfileira** job
  com confirmação em dois turnos; ativação real (gasto) revalida default-deny no runner.

## Resíduo aceito

- `/api/health` é público (liveness do cron Vercel) — retorna só `{ ok: true }`, sem dado/PII.
- Sessão é por senha única + cookie (sem multiusuário/RBAC fino) — suficiente para um operador;
  multiusuário fica como evolução futura.
