# ADR 0038 — OAuth oficial da Meta como segundo método de conexão (token manual continua)

- **Status:** Accepted
- **Data:** 2026-07-30
- **Onda:** pós-12 (SaaS multi-tenant)
- **Spec:** `docs/specs/oauth-meta-conexao-cliente.md`
- **Substitui parcialmente:** ADR 0028 (que reservou `oauth_meta` no enum "sem código atrás")

## Contexto

O MVP conecta a Meta por **token manual** (`connection_method = 'manual_token'`, ADR 0028): o gestor
gera um System User token no Business Manager do cliente e cola no dashboard. Funciona, mas o atrito
de onboarding é alto — um cliente de plataforma (o gestor de tráfego pagante) não deveria precisar
navegar o Business Manager para começar a usar a Trafegante.

O enum `connection_method` já tem `oauth_meta` e a tabela já tem `oauth_meta_user_id`
(placeholder da fase 2). O cofre cifrado (ADR 0027) e o `graph-client` por token de tenant
(ADR 0035/0036) já existem — o que falta é só o fluxo de autorização.

Restrição externa que **não é técnica**: usar `ads_management` / `ads_read` /
`business_management` com contas de terceiros exige **Business Verification + App Review** aprovados
no app da Meta. Sem isso, o fluxo funciona apenas para papéis do próprio app (admin/dev/tester).

## Decisão

Implementar o OAuth oficial da Meta como **segundo** método de conexão, **atrás de flag de env**
(`META_APP_ID` + `META_APP_SECRET`), sem remover o caminho `manual_token`.

Desenho do fluxo (detalhes na spec):

1. `GET /api/oauth/meta/start` (sessão obrigatória) → redireciona para `/dialog/oauth` da Meta com
   `state` = **JWT HS256 assinado com `AUTH_SECRET`** (TTL 10 min, carrega `accountId` + nonce).
   O `state` assinado é a defesa contra CSRF de callback: um callback sem state válido é recusado.
2. `GET /api/oauth/meta/callback` → verifica o `state`, troca `code` por token de curta duração e
   então por **long-lived token** (`fb_exchange_token`).
3. O token trocado **não é gravado ainda** (o usuário ainda não escolheu as contas) e **nunca** volta
   ao browser em texto: fica num cookie `httpOnly` **cifrado com `AD_TOKEN_ENC_KEY`** (mesmo
   AES-256-GCM do cofre), TTL 10 min — um "staging" efêmero.
4. A UI lista as contas de anúncio acessíveis (`/me/adaccounts`) e o operador escolhe quais importar;
   `POST /api/data/connections/oauth-finish` decifra o cookie, grava uma conexão por conta escolhida
   com `connection_method='oauth_meta'` + `oauth_meta_user_id`, e **apaga o cookie**.

Cookie efêmero cifrado em vez de tabela nova: evita migration e evita persistir um token que o
usuário pode nem confirmar. O mesmo `sealSecret`/`decryptSecret` do cofre é reutilizado, então o
formato de cripto continua num só lugar.

## Consequências

- **Positivas:** onboarding de um clique para o cliente; zero mudança de schema (enum e coluna já
  existiam); reusa cofre cifrado, `graph-client` e o seletor de contas do fluxo manual; token manual
  segue disponível como fallback (e para quem já está conectado).
- **Negativas / trade-offs:** só serve clientes reais **depois** de Business Verification + App
  Review; até lá vale para papéis do app (teste). Dois métodos de conexão convivendo. Token de
  usuário long-lived expira (~60 dias) e precisa de renovação/revalidação — diferente do System User,
  que não expira sozinho.
- **Riscos & mitigação:** callback forjado → `state` JWT assinado + TTL curto; token vazando pelo
  browser → cookie `httpOnly`, `secure`, `SameSite=Lax`, **conteúdo cifrado** (nem o browser nem log
  veem o token); conexão criada em account alheia → `accountId` vem do `state`/claims e passa por
  `canManageAccount`; token expirado → `status='unverified'` na criação, o cron de validação marca
  `invalid`/`revoked` como já faz no manual.

## Alternativas consideradas

- **Tabela `oauth_pending`** — rejeitada por agora: exige migration e persiste segredo de um fluxo
  que pode ser abandonado. O cookie cifrado tem o mesmo efeito com TTL natural.
- **Gravar conexões de todas as contas no callback** — rejeitada: cria conexões que o operador não
  pediu e colide com o índice anti-hijack de `meta_ad_account_id`.
- **Guardar o token de curta duração e trocar sob demanda** — rejeitada: expira em ~1h; a troca por
  long-lived no callback é o momento certo.
- **Abandonar o token manual** — rejeitada: o OAuth é gated por App Review; remover o manual
  quebraria o onboarding possível hoje.
