#!/usr/bin/env bash
# Onda 9 — Poller do modo autônomo (SPEC §8 Onda 9, ADR 0019). Disparado pelo supercronic. Lock de
# diretório (mkdir atômico) garante exclusão mútua; delega a 1 tick determinístico ao TS
# (poll-watch-once.ts), que avança uma fase e insere ≤1 narração. Trap libera o lock mesmo em crash.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

LOCK_DIR="${WATCH_LOCK_DIR:-/tmp/autonomous-watches.lock}"

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "poll-autonomous-watches: lock held ($LOCK_DIR); skipping tick"
  exit 0
fi
trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT

if ! npx tsx scripts/runner/poll-watch-once.ts; then
  echo "poll-autonomous-watches: poll-watch-once returned non-zero"
fi
