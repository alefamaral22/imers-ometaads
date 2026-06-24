# Threat model STRIDE — Snapshot ao vivo da Meta para o Nexus (Onda 16)

- **Onda:** 16
- **Superfície:** novo `kind = 'snapshot'` na fila `agent_jobs`; tabela `live_snapshots`; tools
  `request_live_snapshot` / `get_live_snapshot` do Nexus; endpoint `GET /api/nexus/snapshot`; skill
  read-only `live-snapshot-cliente-exemplo` no runner.
- **Confiança:** cada account é um tenant mutuamente desconfiado (ADR 0026/0031). A sessão (JWT, ADR
  0029) define o escopo; `super_admin`/`socio` operam o Nexus; `cliente_usuario` **não** acessa `/api/nexus/*`.
- **Specs/ADRs:** `SPEC-016-nexus-live-snapshot.md`, ADR 0032 (e 0009/0025/0031).

## Ativos
- Confidencialidade das métricas de campanha por tenant (no `payload` de `live_snapshots`).
- Integridade da fila (`snapshot` é read-only — não pode virar vetor de escrita/gasto na Meta).
- A conta Meta (acesso só no runner, via MCP, com least privilege de leitura).

## STRIDE

### Spoofing
- **Ameaça:** chamar `GET /api/nexus/snapshot` ou as tools fingindo outro escopo.
- **Mitigação:** escopo vem do JWT validado (ADR 0029), nunca do cliente; `/api/nexus/*` gated a
  super_admin/socio; `cliente_usuario` recebe 403 e o widget some no Shell.

### Tampering
- **Ameaça:** o modelo/operador tentar transformar o snapshot numa ação de escrita (pausar/criar) sem
  confirmação, ou injetar slug arbitrário na fila.
- **Mitigação:** `request_live_snapshot` resolve **apenas** o slug `live-snapshot` pela allowlist
  server-side (texto livre → deny); `classifyTool` separa `snapshot` (read-only, enfileira sem
  confirmar) de `write` (confirmação em dois turnos). A skill tem `allowed-tools` **só de leitura** —
  não consegue mutar a Meta mesmo sob prompt-injection. Escrita derivada só via `enqueue_job` + token.

### Repudiation
- **N/A direto** (leitura). O job em si fica registrado em `agent_jobs`/telemetria (Onda 3); mutações
  derivadas seguem em `operation_logs`.

### Information Disclosure
- **Ameaça:** `payload` de `live_snapshots` vazar entre tenants ou conter PII.
- **Mitigação:** RLS deny-by-default (só `service_role`); leitura no dashboard escopada por account
  (`scopeEq`/`clientScopeFilter`, ADR 0031); 404 deny-by-default para `job_id` fora do escopo (não
  distingue 403/404). Payload contém **só métricas agregadas** — sem PII; dinheiro em centavos.

### Denial of Service
- **Ameaça:** flood de `request_live_snapshot` enchendo a fila / a conta Meta; polling abusivo no
  endpoint.
- **Mitigação:** rate-limit em `/api/nexus/*` (inclui o snapshot e o trigger); polling com intervalo
  mínimo e timeout; snapshot compacto (período curto, sem fan-out caro). Idempotência por `job_id`
  evita reprocessamento. Considerar coalescer snapshots recentes (reusar o último < N minutos).

### Elevation of Privilege
- **Ameaça:** usar o caminho read-only para alcançar capacidade de escrita na Meta.
- **Mitigação:** o kind `snapshot` não tem caminho de mutação; a skill não recebe nenhuma tool de
  escrita; a única forma de mutar segue sendo `enqueue_job` (kinds de escrita) com confirmação. O
  dashboard nunca ganha token/credencial Meta (ADR 0032).

## Resíduos / acompanhar
- Coalescência de snapshots para conter custo na Meta sob uso intenso (otimização futura).
- Se evoluir para o endpoint inbound no runner (alternativa B do ADR 0032), refazer este STRIDE para a
  nova superfície.
