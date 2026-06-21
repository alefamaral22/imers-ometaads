# Threat model STRIDE — Ativação + campanha de vendas

- **Onda:** 5
- **Superfície:** skills headless `activate-campaign-cliente-exemplo` (kind `activate`) e
  `create-sales-cliente-exemplo-campaign` (kind `create_sales`) + lógica `scripts/onda5/`.
- **Confiança:** rodam no runner headless (`claude -p --dangerously-skip-permissions`), disparadas por
  `agent_jobs` (dashboard/Nexus, confirmação em dois turnos na Onda 7). Entradas: args do job
  (`CAMPAIGN_ID`, pixel), estado do banco, respostas da Meta. Saídas: **mutações reais** na conta Meta
  (ativação liga gasto; vendas cria entidades PAUSED) + escritas no Supabase.

## Ativos

- **Orçamento/gasto real** da conta Meta — a ativação é a operação de maior risco do sistema.
- `SUPABASE_SECRET_KEY` (acesso total ao banco, bypassa RLS).
- Integridade de `campaigns/ad_sets/ads/operation_logs`.

## STRIDE

### Spoofing
- **Ameaça:** job forjado ativando/criando na conta ou cliente errado.
- **Mitigação:** estado lido **do banco** por id, **nunca** dos args; `evaluateActivation` checa
  `right_client` e `has_meta_id`; o runner (Onda 3) valida skill on-disk e charset dos args.

### Tampering
- **Ameaça:** args/resposta da Meta induzindo orçamento acima do teto ou ativação indevida (prompt
  injection no conteúdo).
- **Mitigação:** decisões em **TS puro e determinístico** (`evaluateActivation`, `clampDailyBudgetCents`,
  `buildSalesAdSetPayload`); teto re-checado; conteúdo da Meta é **dado, não instrução**.

### Repudiation
- **Ameaça:** ativação/criação sem rastro.
- **Mitigação:** `operation_logs` append-only (`action='activate'`/`'create'`, `actor`, `summary`) +
  manifest por execução (inclui as **recusas**, com `checks`/`reasons`) + `agent_events` (`run_id`).

### Information Disclosure
- **Ameaça:** segredo/PII em log/manifest.
- **Mitigação:** segredos só em env; manifest/`operation_logs` carregam só specs e ids (sem PII); pixel
  id não é segredo de usuário.

### Denial of Service / gasto descontrolado
- **Ameaça:** ativar campanha fora do teto; loop recriando vendas; ativar a campanha errada.
- **Mitigação:** **default-deny** na ativação (aborta na dúvida); vendas **sempre PAUSED** (não gasta
  até ativação validada) com orçamento clampado; idempotência por chave natural; índice único parcial
  de `agent_jobs` impede dois jobs ativos por `(client_id, kind)`.

### Elevation of Privilege
- **Ameaça:** skill ganhando poder além do necessário (deletar, criar onde só devia ativar).
- **Mitigação:** **least privilege** — `activate-*` só tem `ads_activate_entity`/`ads_update_entity`
  (status); `create-sales-*` só tem `ads_create_*`. Nenhuma tem `delete`. Persistência só via REST +
  service key; RPCs sensíveis com EXECUTE revogado (Onda 1).

## Resíduo aceito

- A ativação é, por natureza, uma operação que gasta dinheiro real; mitigada por default-deny,
  revalidação a partir do banco e confirmação em dois turnos no Nexus (Onda 7).
- `--dangerously-skip-permissions` é inerente ao headless; mitigado por validação de skill/args no
  runner e por toda decisão de risco viver em TS puro e testado.
