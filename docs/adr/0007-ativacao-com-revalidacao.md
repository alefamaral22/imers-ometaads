# ADR 0007 — Ativação com revalidação e default-deny

- **Status:** Accepted
- **Data:** 2026-06-21
- **Onda:** 5

## Contexto

Ativar uma campanha **liga gasto real** de mídia — é a operação mais perigosa do sistema. Ela é
disparada por um job `activate` (pelo dashboard/Nexus, com confirmação em dois turnos na Onda 7), mas o
runner executa headless. Entre o enfileiramento e a execução o mundo pode ter mudado (orçamento
editado, campanha arquivada, cliente errado nos args). Precisamos garantir que **nada gasta por
engano** e que a decisão seja auditável.

## Decisão

A skill `activate-campaign-<cliente>` **revalida tudo no momento da execução** lendo o estado **do
banco** (nunca dos args livres) e decide com a função pura `evaluateActivation`, que é **default-deny**:
a ativação só ocorre se **todas** as checagens passarem — cliente correto, `meta_campaign_id` presente,
estado atual `PAUSED`, teto > 0, ao menos um ad_set, e **todo** orçamento (campanha + ad_sets) em
`1..teto`. Qualquer ausência/ambiguidade nega. Só após `allowed=true` a skill liga na Meta
(`ads_activate_entity`/`ads_update_entity`), reflete `status=ACTIVE` no banco (`patchById`) e grava
`operation_logs action='activate'` por entidade. Um manifest registra `checks`/`reasons` mesmo quando
nega. As `allowed-tools` de escrita são **apenas** as de status (sem create/delete).

## Consequências

- **Positivas:** "aborta por padrão na dúvida" elimina ativação acidental; decisão determinística e
  testável (sem rede); rastro completo (manifest + operation_logs) inclusive das recusas; least
  privilege (só flip de status).
- **Negativas / trade-offs:** uma campanha legítima pode ser recusada se o estado do banco estiver
  desatualizado — preferimos um falso-negativo (não gasta) a um falso-positivo (gasta errado).
- **Riscos & mitigação:** divergência banco↔Meta → a skill lê os `meta_*_id` do banco e age só sobre
  eles; concorrência → o índice único parcial de `agent_jobs` (ADR 0009) impede dois `activate` ativos.

## Alternativas consideradas

- **Ativar confiando nos args do job** — rejeitado: args são fronteira não confiável (poderiam apontar
  para o cliente/campanha errados); o estado tem de vir do banco e ser revalidado.
- **Default-allow com poucas checagens** — rejeitado: inverte o viés de risco numa operação que gasta
  dinheiro real.
