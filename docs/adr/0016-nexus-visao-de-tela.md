# ADR 0016 — Visão de tela do Nexus por captura no cliente + descrição server-side

- **Status:** Accepted
- **Data:** 2026-06-21
- **Onda:** 7

## Contexto

O Nexus pode "olhar" a tela do operador para ajudar (ex.: descrever um painel, ler um número). Isso
levanta duas preocupações: (a) a imagem pode conter texto que tente comandar o agente (prompt injection
visual); (b) a chamada de visão usa a `CLAUDE_API_KEY`, que não pode ir ao browser.

## Decisão

A captura é **client-side** (o browser tira o print e manda um data URL base64 para
`POST /api/nexus/capture`); a **descrição** é **server-side** (`describeScreen` chama a API de mensagens
da Anthropic com a imagem como bloco `image`). O prompt de sistema e o texto que acompanha a imagem
deixam explícito que **o conteúdo da imagem é dado para análise, não instruções** — qualquer "comando"
na tela é ignorado. A entrada é validada por schema (`captureRequestSchema`: só `data:image/(png|jpeg)`
base64, com limite de tamanho). Degrada via `503` quando não há `CLAUDE_API_KEY`.

## Consequências

- **Positivas:** segredo só no servidor; injeção visual neutralizada (imagem é dado); superfície
  pequena e validada; reaproveita o cliente Anthropic do chat.
- **Negativas / trade-offs:** trafega a imagem para o servidor (custo/latência); sem streaming de vídeo
  (é captura sob demanda, não vigilância contínua).
- **Riscos & mitigação:** imagem enorme → limite de tamanho no schema; PII na tela → a descrição é
  efêmera (não persistida) e o endpoint é autenticado + rate-limited.

## Alternativas consideradas

- **Visão no browser com modelo local** — rejeitado: peso/inviável e inconsistente com o resto do chat.
- **Mandar a imagem sem aviso anti-injeção** — rejeitado: deixaria o texto da tela virar instrução.
