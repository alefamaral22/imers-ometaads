// Checkout link builder — pure. Resolves a CTA + page settings into the final checkout href,
// carrying UTMs and (optionally) the affiliate ref. No I/O.
import type { Cta } from '../sections/common.js';
import type { Settings } from '../settings/settings.js';
import { appendUtm, type UtmParams } from './utm.js';
import { appendRef } from './affiliate.js';

export interface CheckoutContext {
  settings: Settings;
  utm: UtmParams;
  // The captured affiliate referral code (already validated), if any.
  ref?: string;
}

// Resolve a CTA's destination URL. "checkout" => settings.checkoutUrl; "url"/"anchor" => href.
// Returns null when the action cannot be resolved (e.g. checkout with no configured URL).
export function resolveCtaHref(cta: Cta, ctx: CheckoutContext): string | null {
  if (cta.action === 'anchor') return cta.href ?? null;
  if (cta.action === 'url') return cta.href ?? null;

  // action === 'checkout'
  const base = ctx.settings.checkoutUrl;
  if (base === undefined) return null;

  let href = appendUtm(base, ctx.utm);
  if (ctx.settings.affiliateEnabled && ctx.ref !== undefined) {
    href = appendRef(href, ctx.ref);
  }
  return href;
}

// Build a checkout href directly from settings (e.g. a global "buy now" button).
export function buildCheckoutHref(ctx: CheckoutContext): string | null {
  return resolveCtaHref({ label: '', action: 'checkout' }, ctx);
}
