#!/usr/bin/env node
// Onda 9 — Screenshotter para o live review do Nexus (SPEC §8 Onda 9). SSRF-guard: só captura hosts
// sob *.example.com (preview das LPs) — nunca IPs/intranet/domínios arbitrários. Playwright é opcional:
// sem ele, sai com erro claro (degrada). Uso: node scripts/screenshot-page.cjs <url> <out.png>
'use strict';

const ALLOWED_SUFFIX = process.env.SCREENSHOT_ALLOWED_SUFFIX || '.example.com';

/** SSRF-guard: aceita só https para um host == example.com ou *.example.com. */
function isAllowedUrl(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase();
  const bare = ALLOWED_SUFFIX.replace(/^\./, '');
  return host === bare || host.endsWith(ALLOWED_SUFFIX);
}

async function main() {
  const [url, out] = process.argv.slice(2);
  if (!url || !out) {
    console.error('usage: node scripts/screenshot-page.cjs <url> <out.png>');
    process.exit(2);
  }
  if (!isAllowedUrl(url)) {
    console.error(`refused: ${url} is not under ${ALLOWED_SUFFIX} (SSRF-guard)`);
    process.exit(3);
  }

  let chromium;
  try {
    ({ chromium } = require('playwright'));
  } catch {
    console.error('playwright not installed — screenshot unavailable (degraded)');
    process.exit(4);
  }

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.screenshot({ path: out, fullPage: true });
    console.log(`screenshot saved: ${out}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('screenshot error:', err && err.message ? err.message : err);
  process.exit(1);
});

module.exports = { isAllowedUrl };
