// Onda 13 — Define email + senha (scrypt) de uma account, via REST (SUPABASE_SECRET_KEY). Uso manual:
//   SUPABASE_URL=… SUPABASE_SECRET_KEY=… npx tsx scripts/onda13/set-account-password.ts <slug> <email> <senha>
// O hash usa O MESMO formato do dashboard (web/lib/auth/password.ts): 'scrypt$<saltHex>$<hashHex>'.
// Tira a account do bootstrap legado (DASHBOARD_PASSWORD) ao dar a ela uma credencial própria.

import process from 'node:process';
import { scryptSync, randomBytes } from 'node:crypto';
import { requireString } from '../onda2/domain/validation.ts';

function hashPassword(plain: string): string {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString('hex')}$${scryptSync(plain, salt, 64).toString('hex')}`;
}

async function main(): Promise<void> {
  const [slug, email, password] = process.argv.slice(2);
  if (!slug || !email || !password) {
    process.stderr.write('usage: set-account-password.ts <slug> <email> <senha>\n');
    process.exitCode = 2;
    return;
  }
  const url = requireString(process.env.SUPABASE_URL, 'env.SUPABASE_URL').replace(/\/+$/, '');
  const secret = requireString(process.env.SUPABASE_SECRET_KEY, 'env.SUPABASE_SECRET_KEY');

  const res = await fetch(`${url}/rest/v1/accounts?slug=eq.${encodeURIComponent(slug)}`, {
    method: 'PATCH',
    headers: {
      apikey: secret,
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({ email, password_hash: hashPassword(password) }),
  });
  if (!res.ok) {
    process.stderr.write(`patch accounts failed (${res.status}): ${await res.text()}\n`);
    process.exitCode = 1;
    return;
  }
  const rows = (await res.json()) as unknown[];
  if (rows.length === 0) {
    process.stderr.write(`no account with slug '${slug}'\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`ok: senha de '${slug}' definida (email=${email})\n`);
}

main().catch((err: unknown) => {
  process.stderr.write(
    `set-account-password: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exitCode = 1;
});
