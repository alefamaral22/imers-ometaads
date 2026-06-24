# Threat model STRIDE — Isolamento das leituras operacionais (Onda 15)

- **Onda:** 15
- **Superfície:** leituras de `clients`, `campaigns`, `analyses`, `funnel_events`, `landing_pages`,
  `operation_logs` (páginas `/`, `/analyses`, `/funnel`, `/landing-pages`, `/clients/:slug` e os
  endpoints `GET /api/data/*`); gating de `/api/nexus/*` e `/api/landing/*`; choke-point puro
  `clientScopeFilter` + `accountClientIds`.
- **Confiança:** cada account é um tenant mutuamente desconfiado. A sessão (JWT, ADR 0029) define o
  escopo; `super_admin`/`socio` = visibilidade global; `cliente_usuario` = só a própria account.
- **Specs/ADRs:** `SPEC-isolamento-leituras-operacionais.md`, ADR 0031 (e 0026/0029).

## Ativos
- Confidencialidade dos dados operacionais por tenant (clientes, campanhas, análises, funil, landings, logs).
- O Nexus (cria campanhas, enfileira jobs) e o editor de landing como superfícies de operação da agência.

## STRIDE

### Spoofing
- **Ameaça:** assumir o escopo de outra account para ler seus dados.
- **Mitigação:** o escopo vem do JWT assinado/validado (ADR 0029), nunca do cliente; `scopeFromClaims`
  deriva `accountId`+`role` da sessão em todo handler/página.

### Tampering
- **Ameaça:** manipular o filtro para "ver tudo" (ex.: client_ids vazio virar consulta sem filtro).
- **Mitigação:** `clientScopeFilter([])` → `none` (curto-circuito → resultado vazio), **nunca** `all`.
  Regra pura, coberta por teste de regressão. Queries por PostgREST parametrizado (sem SQL string).

### Repudiation
- **N/A direto** (leitura). Mutações relevantes seguem em `operation_logs` (Ondas anteriores).

### Information Disclosure
- **Ameaça (a causa-raiz):** `cliente_usuario` ver clientes/campanhas/análises/landings/logs de outra
  account; abrir `/clients/<outro>`; ler narrações/dados via Nexus.
- **Mitigação:** toda leitura operacional escopada por `scopeEq`/`clientScopeFilter`; `getClientBySlug`
  escopado → `notFound` para recurso de outra account (não distingue 403/404); `operation_logs`
  restritos aos clientes da account (logs de plataforma com `client_id` null só para visibilidade
  global); `/api/nexus/*` e `/api/landing/*` barrados para `cliente_usuario` (403) e o widget some no Shell.

### Denial of Service
- **Ameaça:** o passo extra (`accountClientIds`) como custo por requisição.
- **Mitigação:** é um SELECT de ids indexado por `account_id`; restrito sem clientes nem vai ao banco
  (`none`). Custo desprezível na escala atual (ver dívida no ADR 0031).

### Elevation of Privilege
- **Ameaça:** `cliente_usuario` usar o Nexus para criar campanhas/enfileirar jobs na agência.
- **Mitigação:** `/api/nexus/*` exige `hasRole(['super_admin','socio'])`; o cliente não recebe o widget.

## Resíduo aceito
- **Nexus não é multi-tenant** — é bloqueado para clientes, não escopado. Um co-piloto para o cliente
  será uma superfície nova (fase futura).
- **2 idas ao banco** no filtro das tabelas filhas — aceito; denormalizar `account_id` se virar gargalo.
- **`socio` com visibilidade global** — deliberado (ADR 0029).
