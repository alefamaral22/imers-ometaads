import 'server-only';

/**
 * E-mail transacional via Resend (mesmo provedor de scripts/send-email.cjs, Onda 9). Fail-safe: sem
 * RESEND_API_KEY, degrada para log-only e nunca lança — notificar o cliente nunca pode derrubar a
 * mutação que a originou (ex.: redefinir senha tem que funcionar mesmo se o e-mail falhar).
 */
export async function notifyPasswordReset(toEmail: string, accountName: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.TRANSACTIONAL_FROM_EMAIL || 'nexus@example.com';
  const subject = 'Sua senha foi redefinida';
  const body = `Olá, ${accountName}. Sua senha de acesso ao dashboard foi redefinida por um administrador. Se você não esperava isso, contate o suporte.`;

  if (!apiKey || !toEmail) {
    console.log(`[email log-only] ${subject} -> ${toEmail}: ${body}`);
    return;
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from, to: toEmail, subject, text: body }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error(`resend ${res.status}: ${detail.slice(0, 200)} (degraded to log)`);
    }
  } catch (err) {
    console.error('notifyPasswordReset failed (degraded):', err instanceof Error ? err.message : err);
  }
}
