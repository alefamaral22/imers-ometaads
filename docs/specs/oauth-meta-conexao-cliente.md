# Spec — Conexão Meta por OAuth ("Conectar com Facebook") para o cliente da plataforma

- **ADR:** `docs/adr/0038-oauth-meta-para-conexao-do-cliente.md`
- **Antecedentes:** ADR 0027 (cofre cifrado), ADR 0028 (token manual), ADR 0035/0036 (Graph por
  token de tenant), ADR 0037 (seletor de contas de anúncio)

## Objetivo

Permitir que o cliente da plataforma conecte a própria conta de anúncio Meta com um clique
(login oficial da Meta), em vez de gerar e colar um System User token. O token manual continua
funcionando; o OAuth é um **segundo método**, ligado por env.

## Fora de escopo

- Business Verification / App Review na Meta (processo externo; sem ele o fluxo só atende papéis do
  próprio app).
- Renovação automática do long-lived token (fica com o cron de validação existente, que já marca
  `invalid`/`revoked`).
- MCP próprio da Meta (camada de ferramentas para a IA; independente deste fluxo).

## Contrato de ambiente

| Variável | Obrigatória | Papel |
| --- | --- | --- |
| `META_APP_ID` | para ligar o OAuth | App ID do app Meta (não é segredo, mas fica server-side) |
| `META_APP_SECRET` | para ligar o OAuth | App Secret — segredo, só server-side |
| `META_OAUTH_REDIRECT_URI` | opcional | URI exata registrada no app. Sem ela, deriva de `origin + /api/oauth/meta/callback` |
| `AD_TOKEN_ENC_KEY` | já existia | cifra o token no cofre **e** no cookie de staging |
| `AUTH_SECRET` | já existia | assina o `state` do OAuth (JWT HS256) |

`isMetaOAuthEnabled()` = `META_APP_ID && META_APP_SECRET`. Desligado → a UI não mostra o botão e as
rotas respondem `503 oauth_unconfigured`.

Escopos pedidos: `ads_management`, `ads_read`, `business_management`.

## Fluxo

1. **Início** — `GET /api/oauth/meta/start` (exige sessão; `?accountId=` só é aceito de quem tem
   visibilidade global, senão usa a própria account). Gera `state` = JWT HS256 (`AUTH_SECRET`,
   TTL 600s, claims `accountId` + `nonce`) e redireciona (302) para
   `https://www.facebook.com/v21.0/dialog/oauth?...`.
2. **Callback** — `GET /api/oauth/meta/callback?code&state`:
   - `error=access_denied` (usuário cancelou) → redireciona `/settings?meta_oauth=cancelled`.
   - `state` inválido/expirado → `/settings?meta_oauth=invalid_state` (nada é gravado).
   - troca `code` → token curto (`/oauth/access_token`), depois → **long-lived**
     (`grant_type=fb_exchange_token`).
   - lê `/me?fields=id` para guardar `oauth_meta_user_id`.
   - grava cookie `meta_oauth_pending` (`httpOnly`, `secure`, `SameSite=Lax`, `maxAge=600`) com
     `{token, userId, accountId}` **cifrado** (AES-256-GCM, `AD_TOKEN_ENC_KEY`, mesmo formato do
     cofre) e redireciona `/settings?meta_oauth=ok`.
3. **Seleção** — `GET /api/data/meta/oauth-pending` decifra o cookie e devolve
   `{accountId, adAccounts[]}` (via `listAdAccountsFromToken`). **Nunca** devolve o token.
4. **Conclusão** — `POST /api/data/connections/oauth-finish` com `{accountId, adAccountIds[]}`:
   valida `canManageAccount`, confere que `accountId` bate com o do cookie, cria uma conexão por
   conta (`connection_method='oauth_meta'`, token cifrado, `status='unverified'`,
   `oauth_meta_user_id`), apaga o cookie e devolve `{created, failed}`.
5. **Descarte** — `POST /api/data/meta/oauth-pending/discard` apaga o cookie (botão "Cancelar").

## Regras invioláveis aplicadas

- O token em texto puro existe só em memória do handler e dentro do cookie **cifrado**; nunca em
  resposta JSON, nunca em log, nunca em env.
- Conexão nasce `unverified` — quem promove para `active` é o cron de validação existente.
- Uma conexão por conta de anúncio escolhida (índice anti-hijack `meta_ad_account_id` continua
  valendo); conta já conectada → falha só aquela, as outras seguem.
- `accountId` nunca vem de texto livre do browser sem checagem: sai do `state`/claims e passa por
  `canManageAccount`.

## Critérios de aceite

- [x] `npm run lint`, `npm run typecheck`, `npm run test` verdes.
- [x] Testes unitários das partes puras: URL de autorização, assinatura/verificação de `state`,
      seal/open do cookie de staging, parse do callback.
- [x] Com env ausente: `/api/oauth/meta/start` → 503 e `/settings` não mostra o botão.
- [ ] Com app Meta real: fluxo ponta a ponta cria conexão `oauth_meta` (depende de credenciais do
      app e, para contas de terceiros, de App Review).
