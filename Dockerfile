# Onda 3 — Imagem do runner headless (Fly.io). supercronic + Claude Code CLI + tsx.
# Sem superfície HTTP pública (SPEC §1/§3): só lê a fila e executa skills.
FROM node:22-bookworm-slim

# Deps de sistema: bash (scripts), curl/ca-certs (downloads/REST), jq, python3 (hook + playwright),
# git, tini (init que faz reap dos processos-filho do claude).
RUN apt-get update && apt-get install -y --no-install-recommends \
      bash curl ca-certificates jq python3 git tini \
 && rm -rf /var/lib/apt/lists/*

# supercronic: cron amigável a containers (roda sem root, loga em stdout).
ARG SUPERCRONIC_VERSION=v0.2.33
ARG SUPERCRONIC_BIN=supercronic-linux-amd64
RUN curl -fsSLO "https://github.com/aptible/supercronic/releases/download/${SUPERCRONIC_VERSION}/${SUPERCRONIC_BIN}" \
 && chmod +x "${SUPERCRONIC_BIN}" \
 && mv "${SUPERCRONIC_BIN}" /usr/local/bin/supercronic

WORKDIR /app

# Ferramentas globais: Claude Code CLI (skills headless), wrangler (deploy de LP — Onda 8), tsx
# (skills e runner rodam TypeScript direto).
RUN npm install -g @anthropic-ai/claude-code wrangler tsx

# Instala dependências primeiro (camada cacheável). Precisa dos package.json de todos os workspaces.
COPY package.json package-lock.json ./
COPY web/package.json ./web/
COPY packages/lp-render/package.json ./packages/lp-render/
COPY landing-pages/_template/package.json ./landing-pages/_template/
RUN npm ci

# Código do projeto.
COPY . .

# Diretório de logs do runner (poll/cron/skills) + bit de execução nos scripts.
RUN mkdir -p /app/logs && chmod +x scripts/*.sh .claude/hooks/*.py

# Credenciais OAuth do Claude Code persistem num volume montado aqui (ver fly.toml [mounts]).
ENV CLAUDE_CONFIG_DIR=/root/.claude

# tini como PID 1 (reap de zumbis). supercronic lê o crontab e dispara os jobs.
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["supercronic", "/app/crontab"]
