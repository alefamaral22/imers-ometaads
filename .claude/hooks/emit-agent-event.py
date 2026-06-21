#!/usr/bin/env python3
"""Onda 3 — Hook PostToolUse opcional do runner: emite UM agent_event por uso de ferramenta.

Telemetria fina complementar ao parser de stream-json (scripts/runner/emit-from-stream.ts), que já
garante os marcos start/end. Self-guarding: sem AGENT_RUN_ID + credenciais Supabase, sai 0 (no-op) —
assim nunca interfere numa sessão interativa de dev. NUNCA emite PII nem o conteúdo da skill: apenas
o nome da ferramenta e flags estruturais. Best-effort: qualquer erro sai 0 (não bloqueia a skill).
"""
import json
import os
import sys
import urllib.request


def main() -> int:
    run_id = os.environ.get("AGENT_RUN_ID")
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SECRET_KEY")
    # Sem contexto de runner/credenciais → no-op silencioso (dev interativo).
    if not (run_id and url and key):
        return 0

    try:
        event = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        return 0

    tool_name = event.get("tool_name")
    row = {
        "run_id": run_id,
        "agent_name": tool_name,
        "agent_type": "tool",
        "event_type": "step",
        "tool_name": tool_name,
        # Estrutura apenas — sem inputs/valores (anti-PII).
        "payload": {"source": "hook", "hook": event.get("hook_event_name", "PostToolUse")},
    }

    req = urllib.request.Request(
        url.rstrip("/") + "/rest/v1/agent_events",
        data=json.dumps(row).encode("utf-8"),
        method="POST",
        headers={
            "apikey": key,
            "Authorization": "Bearer " + key,
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        },
    )
    try:
        urllib.request.urlopen(req, timeout=5).close()
    except Exception as exc:  # telemetria é best-effort
        sys.stderr.write("emit-agent-event: %s\n" % exc)
    return 0


if __name__ == "__main__":
    sys.exit(main())
