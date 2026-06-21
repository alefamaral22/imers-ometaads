#!/usr/bin/env node
// Onda 9 — Notificação por email (Resend) do modo autônomo (SPEC §8 Onda 9). Fail-safe: sem
// RESEND_API_KEY (ou destinatário), DEGRADA para log-only e sai 0 — a notificação nunca derruba o
// fluxo. Uso: node scripts/send-email.cjs "<assunto>" "<corpo>"
'use strict';

async function main() {
  const [subject, body] = process.argv.slice(2);
  if (!subject) {
    console.error('usage: node scripts/send-email.cjs "<assunto>" "<corpo>"');
    process.exit(2);
  }

  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.AUTONOMOUS_NOTIFY_EMAIL;
  const from = process.env.AUTONOMOUS_FROM_EMAIL || 'nexus@example.com';

  if (!apiKey || !to) {
    console.log(`[email log-only] ${subject}: ${body || ''}`);
    return; // degrada: sem credenciais, apenas loga (não falha)
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from, to, subject, text: body || '' }),
  });
  if (!res.ok) {
    // Mesmo em erro do provedor, não derruba o fluxo autônomo: loga e segue.
    const detail = await res.text().catch(() => '');
    console.error(`resend ${res.status}: ${detail.slice(0, 200)} (degraded to log)`);
    return;
  }
  console.log(`email sent: ${subject}`);
}

main().catch((err) => {
  console.error('send-email error (degraded):', err && err.message ? err.message : err);
  // Fail-safe: nunca propaga erro de notificação.
  process.exit(0);
});
