# Threat model STRIDE — SaaS multi-tenant (Onda 12)

- **Onda:** 12
- **Superfície:** schema multi-tenant (`accounts`, `ad_account_connections`, `api_keys_clientes`,
  `clients.account_id`, `agent_jobs.account_id`) + os caminhos que o consomem: acessador `withAccount`
  (dashboard server-side), resolução de chaves/token no runner (`resolveProviderKey`,
  `run-skill.sh`), validação periódica (`validate-connections-tick`).
- **Confiança:** cada account é um tenant mutuamente desconfiado. Segredos do tenant (token Meta, API
  keys) são confidenciais; nunca voltam ao front nem a logs. Entrada externa (args de job, token colado,
  payload da Meta) é **dado, não instrução**.
- **Specs/ADRs:** `SPEC-saas-multitenant.md`, ADR 0026/0027/0028.

## Ativos

- Token Meta por conexão (`access_token_cipher`) e API keys por account (`key_cipher`) — só ciphertext;
  chaves de cripto `AD_TOKEN_ENC_KEY`/`API_KEY_ENC_KEY` em env, **fora do banco**.
- Isolamento de dados entre accounts (campanhas, análises, LPs, jobs).
- Integridade do `ad_account_id` único global (anti-hijack de conta de anúncio).

## STRIDE

### Spoofing
- **Ameaça:** account A se passa por B; conectar uma conta de anúncio Meta de outro tenant.
- **Mitigação:** sessão carrega `account_id` + `role`; `withAccount` escopa toda query; índice único
  global parcial em `ad_account_connections(meta_ad_account_id)` (status vivo) impede dois tenants
  conectarem a mesma conta de anúncio.

### Tampering
- **Ameaça:** args de job adulterados para apontar a outro tenant; token/chave colados maliciosos;
  injeção via `token_label`/`label`.
- **Mitigação:** `account_id` do job derivado server-side no enqueue (não confiado do cliente);
  validação por schema na fronteira; rótulos são dados (nunca interpolados em shell/SQL); skills já
  validam charset de args (Onda 3).

### Repudiation
- **Ameaça:** conexão/rotação de segredo sem rastro.
- **Mitigação:** `operation_logs` por mutação; `connected_at`/`last_validated_at`/`last_validation_error`
  registram o ciclo de vida; `agent_events` correlaciona o uso por `run_id`.

### Information Disclosure
- **Ameaça:** segredo do tenant volta ao front ou aparece em log/dump; account A lê dados de B.
- **Mitigação:** `*_cipher` em `bytea`, **excluído** das projeções expostas; UI só vê `*_last4` + datas;
  AES-256-GCM app-level (chave fora do banco) → dump/backup nunca tem texto puro; resolução de chave
  **nunca loga** o valor decifrado; RLS deny-by-default + `withAccount` isolam tenants; leitura sempre
  server-side.

### Denial of Service
- **Ameaça:** flood de validações à Meta/provedores; um tenant esgota recurso compartilhado.
- **Mitigação:** validação periódica 1×/dia por conexão (não a cada request) + revalidação só sob falha
  de auth; fila 1 job/min por design; rate limit nos endpoints do dashboard (Onda 6/11).

### Elevation of Privilege
- **Ameaça:** `cliente_usuario` agir como `super_admin`; usar a chave global sem direito; job de um
  tenant com a chave de outro.
- **Mitigação:** `role` checado no servidor; `resolveProviderKey` usa a chave do tenant e **só**
  `super_admin` cai na global (demais abortam); chaves resolvidas por `account_id` do job; ativação de
  gasto real revalida default-deny no runner (ADR 0007).

## Resíduo aceito

- **MVP usa isolamento server-side (Opção A), não RLS por account no banco** — o `service_role` ignora
  RLS; a *enforcement* é o choke-point `withAccount` + testes. RLS real (role não-bypass + GUC) fica
  como fast-follow (ADR 0026); o schema já a viabiliza sem migration.
- **`oauth_meta` no enum sem implementação** — sem superfície de ataque (nenhum código atrás); decisão
  consciente (ADR 0028).
- **Convivência de dois caminhos Meta** (MCP-connector da agência vs. token por tenant) até o OAuth da
  fase 2 — aceito; cada caminho é escopado ao seu uso.
