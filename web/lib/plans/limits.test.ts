import { describe, expect, it } from 'vitest';
import { checkPlanLimit } from './limits';

describe('checkPlanLimit', () => {
  it('limit null = ilimitado (sempre ok)', () => {
    expect(checkPlanLimit({ limit: null, current: 9999 })).toEqual({ ok: true });
  });

  it('dentro do limite = ok', () => {
    expect(checkPlanLimit({ limit: 5, current: 3 })).toEqual({ ok: true });
  });

  it('no limite (current === limit) = estoura ao criar mais um', () => {
    expect(checkPlanLimit({ limit: 5, current: 5 })).toEqual({ ok: false, limit: 5, current: 5 });
  });

  it('acima do limite = estoura', () => {
    expect(checkPlanLimit({ limit: 3, current: 4 })).toEqual({ ok: false, limit: 3, current: 4 });
  });

  it('limite zero bloqueia qualquer criação', () => {
    expect(checkPlanLimit({ limit: 0, current: 0 })).toEqual({ ok: false, limit: 0, current: 0 });
  });
});
