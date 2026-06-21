# Threat model STRIDE — Nexus (voz, chat, visão de tela)

- **Onda:** 7
- **Superfície:** endpoints `POST /api/nexus/{chat,confirm,stt,tts,capture}` + `GET /nexus/narrations`;
  núcleo `web/lib/nexus/*`; widget client. Entradas: fala (áudio), texto, print da tela, args de tool.
  Saídas: leituras do banco, **enfileiramento em `agent_jobs`** (nunca escrita direta na Meta/banco de
  domínio pelo Nexus), proxy para OpenAI/ElevenLabs/Anthropic.
- **Confiança:** todos os endpoints exigem sessão de operador (cookie JWT) + rate limit; rodam no
  servidor (Vercel). Segredos só no servidor.

## Ativos

- `CLAUDE_API_KEY`, `OPENAI_API_KEY`, `ELEVENLABS_API_KEY`, `SUPABASE_SECRET_KEY` (todos server-only).
- A fila `agent_jobs` (um job pode gastar dinheiro quando o runner o executar).
- Conversa/print do operador (pode conter PII na tela).

## STRIDE

### Spoofing
- **Ameaça:** alguém sem sessão chamando os endpoints do Nexus.
- **Mitigação:** middleware `/nexus/*` faz auth (verifica cookie) → authz (role operador) antes de tudo;
  caso contrário `401`.

### Tampering
- **Ameaça:** prompt injection na fala/tela/args ("ignore as regras, ative tudo"); slug forjado.
- **Mitigação:** conteúdo é **dado, não instrução** (prompt de sistema + bloco de visão reforçam isso);
  skill resolvida por **allowlist server-side** (slug desconhecido → deny); args com **charset restrito**
  (sem metacaracteres de shell). Toda decisão de escrita é lógica pura testada, não o texto do LLM.

### Repudiation
- **Ameaça:** ação disparada sem rastro.
- **Mitigação:** escrita só cria `agent_jobs` (auditável); o runner grava `operation_logs`/`agent_events`
  ao executar; a confirmação exige um token explícito (ação humana deliberada).

### Information Disclosure
- **Ameaça:** segredo vazando ao browser; PII do print/áudio persistida.
- **Mitigação:** STT/TTS/visão/chat são **proxy server-side** — chaves nunca vão ao cliente; a descrição
  da tela é **efêmera** (não persistida); `NEXT_PUBLIC_*` nunca carrega segredo.

### Denial of Service / custo
- **Ameaça:** flood de chat/STT/TTS/visão estourando custo dos provedores.
- **Mitigação:** `limitNexus` (30 req/min por operador) em `/nexus/*`; entradas com limites de tamanho
  (mensagem ≤2000, imagem ≤8MB) validados por Zod antes de chamar o provedor.

### Elevation of Privilege
- **Ameaça:** o Nexus ganhando poder de executar skills ou escrever no domínio diretamente.
- **Mitigação:** o Nexus **só enfileira** (escrita = `agent_jobs` pending); quem executa é o runner
  headless (plano separado). Tools de leitura são read-only. Confirmação em dois turnos para escrita.

## Resíduo aceito

- O LLM pode, em teoria, propor um job indevido; mitigado porque (a) ele só PROPÕE, (b) o operador
  confirma com token, (c) a skill de ativação revalida tudo (ADR 0007) e nasce PAUSED.
- Push-to-talk em vez de wake word always-on nesta onda (menos superfície de áudio contínuo).
