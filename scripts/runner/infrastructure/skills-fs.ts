// Onda 3 — Allowlist on-disk de skills: os subdiretórios reais de .claude/skills/. O runner só
// executa o que existe em disco (resolução por allowlist, nunca texto livre — SPEC §10).

import { readdirSync } from 'node:fs';

export function listAvailableSkills(root = '.claude/skills'): string[] {
  try {
    return readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return [];
  }
}
