# Threat model STRIDE — Gestão de conexões Meta e sync de campanhas (ADR 0036)

- **Onda:** pós-super-admin (gestão de conexões + import de campanhas)
- **Superfície:** `DELETE /api/data/connections/:id`, `PATCH /api/data/connections/:id`,
  `POST /api/data/connections/:id/sync-campaigns`; `ad_account_connections`, `public.campaigns`;
  páginas `/settings`, `/accounts/[id]`.
- **Confiança:** o token é decifrado só em memória do processo do dashboard, no instante da chamada
  à Graph API. Toda mutação exige sessão autenticada e escopo de account (`canManageAccount`).
- **Specs/ADRs:** `gestao-conexoes-e-sync-campanhas.md`, ADR 0036, ADR 0027 (cifra), ADR 0035 (REST
  com token do tenant).

## Ativos

- Token Meta (System User) de cada tenant — mesmo ativo do ADR 0035, agora também decifrado no
  runtime do dashboard (Vercel), não só no runner.
- Integridade de `public.campaigns` — dado usado pela Visão geral e por decisões do operador.
- Integridade de qual `client_id` recebe as campanhas importadas.

## STRIDE

### Spoofing

- **Ameaça:** um `cliente_usuario` chamar `DELETE`/`PATCH`/`sync-campaigns` numa conexão de outra
  account.
- **Mitigação:** todo endpoint resolve o escopo (`scopeFromClaims`) e o serviço confere
  `canManageAccount(scope, connection.account_id)` antes de mutar; `super_admin` tem visibilidade
  global, os demais roles não.

### Tampering

- **Ameaça:** manipular o `id` da conexão na URL para editar/apagar/sincronizar uma conexão de outro
  tenant; ou forjar o payload de campanhas vindo da Graph API.
- **Mitigação:** o `id` só resolve dentro do escopo do chamador (query filtra por `account_id`
  quando não há visibilidade global); a resposta da Graph API é **dado de fronteira** — cada campo é
  validado por schema Zod antes do upsert (nunca `eval`/interpretação, nunca vira instrução).

### Repudiation

- **Ameaça:** apagar/editar uma conexão sem rastro de quem fez.
- **Mitigação:** `writeOperationLog` por mutação (`action='update'`/`'delete'`, `actor=claims.slug`),
  seguindo o padrão já usado em `createAccount`/`archiveAccount`.

### Information Disclosure

- **Ameaça:** vazar o token em log, na resposta da API, ou no corpo de erro de `sync-campaigns`.
- **Mitigação:** o token decifrado nunca sai da função que faz a chamada REST; `MetaGraphError`
  não inclui o token; a resposta do endpoint devolve só contagem/status, nunca o payload cru da
  Graph API. `PATCH` de edição aceita token novo em texto puro só para re-cifrar — nunca o devolve.

### Denial of Service

- **Ameaça:** disparar `sync-campaigns` repetidamente (rate-limit da Graph API) ou numa conta com
  muitas campanhas, prendendo a função serverless até o timeout.
- **Mitigação:** o endpoint pagina a leitura da Graph API com limite superior (ex.: 200 campanhas);
  erro de rate-limit da Meta é reportado como erro transitório (não marca a conexão como inválida);
  o botão desabilita durante a chamada (sem duplo clique) — mas não há rate-limit próprio no
  endpoint ainda (resíduo aceito abaixo).

### Elevation of Privilege

- **Ameaça:** `sync-campaigns` gravar campanhas num `client_id` fora do escopo da conexão, ou editar
  o `meta_ad_account_id` para colidir com a conexão de outro tenant.
- **Mitigação:** a resolução do cliente (ADR 0036 §3) só considera clientes da mesma `account_id` da
  conexão; a constraint única de `meta_ad_account_id` (anti-hijack global, já existente) impede duas
  contas terem a mesma conta de anúncio conectada.

## Resíduo aceito

- **Sem rate-limit dedicado em `sync-campaigns`** — mitigado parcialmente pelo desabilitar do botão
  na UI durante a chamada; um operador mal-intencionado com sessão válida poderia chamar o endpoint
  repetidamente via curl. Aceito por ora: a única consequência é rate-limit da própria Graph API
  (erro tratado), não gasto nem mutação destrutiva.
- **Import síncrono no runtime do dashboard, não no runner isolado** — amplia levemente a superfície
  onde o token Meta é decifrado (processo Vercel além do runner Fly.io). Aceito porque o decrypt usa
  a mesma chave/algoritmo já auditado (ADR 0027) e o dashboard já é o único caminho de **cifra** —
  adicionar a decifra ao mesmo processo não introduz uma nova chave nem um novo canal de exposição.
