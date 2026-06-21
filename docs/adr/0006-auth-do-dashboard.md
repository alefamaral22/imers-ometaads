# ADR 0006 — Autenticação do dashboard: senha (hash) + cookie JWT assinado

- **Status:** Accepted
- **Data:** 2026-06-21
- **Onda:** 6

## Contexto

O dashboard é de **um operador** (não multiusuário) e dá acesso a dados sensíveis da agência. Precisamos
de um gate simples, sem depender de um IdP externo, mas seguindo a ordem **auth → authz → validação →
lógica** e com proteção contra força bruta e bots.

## Decisão

Login por **senha**, comparada ao **hash SHA-256** em `DASHBOARD_PASSWORD` (nunca o texto puro). Sucesso
emite um **cookie de sessão JWT assinado** com `AUTH_SECRET` (≥32 bytes), `httpOnly`, `secure`,
`sameSite=Lax`, com TTL. O endpoint de login é público e tem **rate limit** (Upstash, com fallback) e
**Turnstile opcional** (ativado só quando as chaves existem). O guard server-side `requireOperator()`
verifica o cookie e o papel antes de qualquer página/route protegida; sem sessão → redirect `/login`.
O `middleware.ts` aplica **headers de segurança em todas as respostas** (HSTS, CSP com **nonce**,
X-Content-Type-Options, X-Frame-Options, Referrer-Policy). Toda entrada (corpo do login) é validada por
Zod — dado, não instrução.

## Consequências

- **Positivas:** sem segredo no browser; ordem de segurança explícita e reusável; brute-force e bots
  mitigados; CSP por nonce reduz XSS.
- **Negativas / trade-offs:** modelo de um operador (não há gestão de usuários/roles ricos); rotação de
  senha exige recalcular o hash e atualizar o env.
- **Riscos & mitigação:** vazamento de `AUTH_SECRET` permitiria forjar sessão → segredo fora do código,
  só em env do Vercel; cookie `httpOnly`/`secure`.

## Alternativas consideradas

- **Supabase Auth / OAuth** — rejeitado por ora: excesso para um operador; adiciona dependência de fluxo
  externo. Pode ser adotado se o time crescer.
- **Basic auth** — rejeitado: sem sessão, sem rate limit/Turnstile, credencial reenviada a cada request.
