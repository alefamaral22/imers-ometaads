# ADR 0009 — Fila de trabalho por polling na tabela `agent_jobs`

- **Status:** Accepted
- **Data:** 2026-06-20
- **Onda:** 1

## Contexto

O dashboard precisa pedir trabalho ao runner (criar campanha, analisar, publicar LP) sem chamá-lo
diretamente — não há superfície HTTP inbound no runner (SPEC-000 §1/§3). O runner roda skills caras e
não-idempotentes por natureza (gasto de mídia), então precisamos de: claim atômico sob concorrência
(várias máquinas/ticks), dedup (não criar duas campanhas para o mesmo cliente), e rastreabilidade de
estado (pending→…→completed/failed).

## Decisão

Usamos a tabela **`agent_jobs`** como fila por **polling**. O dashboard (ou o Nexus) insere
`{client_id, skill, kind, args, status:'pending', requested_by}`. O runner faz polling 1×/min e chama
a RPC **`claim_agent_job(worker)`** (`SECURITY DEFINER`, `FOR UPDATE SKIP LOCKED`, `LIMIT 1`) que move
`pending → claimed` numa única transação, pulando linhas já travadas. Depois executa e patcha o status
(`running → completed|failed`). Dedup é garantido por **índices únicos parciais**: ≤1 job ativo
(status ∈ pending/claimed/running) por `(client_id, kind)` e por `(landing_page_id, kind)`. `EXECUTE`
das RPCs é revogado de `public`/`anon`/`authenticated` e concedido só a `service_role`.

## Consequências

- **Positivas:** zero broker e zero inbound no runner; claim seguro nativo do Postgres; idempotência
  estrutural via índice parcial; estado e histórico auditáveis na mesma fonte da verdade.
- **Negativas / trade-offs:** latência de até ~1 min (polling, não push); throughput limitado por
  design (1 job/min) — adequado a operações de mídia, não a alto volume.
- **Riscos & mitigação:** job órfão se o worker morre após o claim → o runner usa lock + `trap` de
  crash e patch de status (Onda 3); reprocessamento → skills idempotentes (SPEC §10).

## Alternativas consideradas

- **Push via webhook do dashboard para o runner** — rejeitado: exigiria superfície HTTP pública no
  runner, contrariando o princípio "nenhuma chamada inbound entre planos".
- **Broker externo (QStash/SQS)** — adiado: QStash fica como scheduler dinâmico opcional (§4); a fila
  central permanece na tabela para manter um único canal/fonte da verdade.
