// Onda 2 — Ângulos de copy (SPEC §8 Onda 2 / §10: 3 ângulos autoridade/dor/oferta).
// Lógica pura: define os ângulos canônicos e valida que a copy gerada cobre exatamente os três.

import { ValidationError, requireObject, requireString } from './validation.ts';

export const COPY_ANGLES = ['authority', 'pain', 'offer'] as const;
export type CopyAngle = (typeof COPY_ANGLES)[number];

export const CALL_TO_ACTION_TYPES = [
  'LEARN_MORE',
  'SIGN_UP',
  'SUBSCRIBE',
  'GET_OFFER',
  'SHOP_NOW',
  'BOOK_TRAVEL',
  'CONTACT_US',
] as const;
export type CallToActionType = (typeof CALL_TO_ACTION_TYPES)[number];

export interface AdCopy {
  angle: CopyAngle;
  headline: string;
  primaryText: string;
  description: string;
  cta: CallToActionType;
}

function parseAdCopy(value: unknown, expectedAngle: CopyAngle): AdCopy {
  const obj = requireObject(value, `copy.${expectedAngle}`);
  const angle = requireString(obj.angle, `copy.${expectedAngle}.angle`);
  if (angle !== expectedAngle) {
    throw new ValidationError(`copy.${expectedAngle}.angle`, `expected angle "${expectedAngle}"`);
  }
  const cta = requireString(obj.cta, `copy.${expectedAngle}.cta`);
  if (!CALL_TO_ACTION_TYPES.includes(cta as CallToActionType)) {
    throw new ValidationError(`copy.${expectedAngle}.cta`, `unknown CTA "${cta}"`);
  }
  return {
    angle: expectedAngle,
    headline: requireString(obj.headline, `copy.${expectedAngle}.headline`),
    primaryText: requireString(obj.primaryText, `copy.${expectedAngle}.primaryText`),
    description: requireString(obj.description, `copy.${expectedAngle}.description`),
    cta: cta as CallToActionType,
  };
}

/**
 * Valida que a saída do subagent copywriter cobre EXATAMENTE os três ângulos canônicos, sem faltas
 * nem extras, retornando-os em ordem determinística. A copy é entrada externa: dado, não instrução.
 */
export function parseAngledCopy(value: unknown): AdCopy[] {
  if (!Array.isArray(value)) throw new ValidationError('copy', 'expected an array of 3 ad copies');
  const byAngle = new Map<string, unknown>();
  for (let i = 0; i < value.length; i++) {
    const item = requireObject(value[i], `copy[${i}]`);
    const angle = requireString(item.angle, `copy[${i}].angle`);
    if (byAngle.has(angle)) throw new ValidationError(`copy[${i}].angle`, `duplicate angle "${angle}"`);
    byAngle.set(angle, item);
  }
  if (byAngle.size !== COPY_ANGLES.length) {
    throw new ValidationError(
      'copy',
      `expected exactly ${COPY_ANGLES.length} angles (${COPY_ANGLES.join(', ')})`,
    );
  }
  return COPY_ANGLES.map((angle) => {
    const item = byAngle.get(angle);
    if (item === undefined) throw new ValidationError('copy', `missing angle "${angle}"`);
    return parseAdCopy(item, angle);
  });
}
