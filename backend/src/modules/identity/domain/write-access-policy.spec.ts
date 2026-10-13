import { describe, expect, it } from 'vitest';
import { withCode } from '../../../../test/support/domain-error.js';
import { LocalDate, UnitNumber, YearMonth } from '../../../shared-kernel/index.js';
import type { Actor } from './actor.js';
import { WriteAccessPolicy } from './write-access-policy.js';

const policy = new WriteAccessPolicy();
const september = YearMonth.of(2026, 9);
const owner = (unit: number): Actor => ({
  role: 'OWNER',
  userId: `u${unit}`,
  unit: UnitNumber.of(unit),
});
const superadmin: Actor = { role: 'SUPERADMIN', userId: 'admin' };

/** September 2026 belongs to 501 unless told otherwise. */
const decide = (actor: Actor, today: string, responsible = [501]) =>
  policy.decide({
    actor,
    month: september,
    responsibleUnits: responsible.map((n) => UnitNumber.of(n)),
    today: LocalDate.parse(today),
  });

describe('WriteAccessPolicy', () => {
  it('lets the responsible owner write during the month', () => {
    expect(decide(owner(501), '2026-09-01')).toEqual({ allowed: true });
    expect(decide(owner(501), '2026-09-30')).toEqual({ allowed: true });
  });

  it('extends the window through the fifth day of the next month', () => {
    expect(decide(owner(501), '2026-10-01')).toEqual({ allowed: true });
    expect(decide(owner(501), '2026-10-05')).toEqual({ allowed: true });
    expect(decide(owner(501), '2026-10-06')).toEqual({
      allowed: false,
      reason: 'OUTSIDE_WRITE_WINDOW',
    });
  });

  it('does not let owners write a month before it starts', () => {
    expect(decide(owner(501), '2026-08-31')).toEqual({
      allowed: false,
      reason: 'OUTSIDE_WRITE_WINDOW',
    });
  });

  it('does not give the next shift holder access to the previous month', () => {
    // On 3 October depto 502 holds the shift, but September is still 501's.
    expect(decide(owner(502), '2026-10-03')).toEqual({ allowed: false, reason: 'NOT_RESPONSIBLE' });
  });

  it('applies the same window to both deptos of a delegation', () => {
    expect(decide(owner(401), '2026-10-04', [501, 401])).toEqual({ allowed: true });
    expect(decide(owner(401), '2026-10-06', [501, 401]).allowed).toBe(false);
  });

  it('lets only the superadmin write a month nobody is responsible for', () => {
    expect(decide(owner(501), '2026-09-10', [])).toEqual({
      allowed: false,
      reason: 'NOT_RESPONSIBLE',
    });
    expect(decide(superadmin, '2026-09-10', [])).toEqual({ allowed: true });
  });

  it('lets the superadmin write any time', () => {
    expect(decide(superadmin, '2027-03-01')).toEqual({ allowed: true });
    expect(decide(superadmin, '2026-01-01')).toEqual({ allowed: true });
  });

  it('exposes the window, handling short months and year ends', () => {
    const window = policy.windowFor(YearMonth.of(2026, 12));
    expect([String(window.from), String(window.to)]).toEqual(['2026-12-01', '2027-01-05']);
    const february = new WriteAccessPolicy(0).windowFor(YearMonth.of(2028, 2));
    expect(String(february.to)).toBe('2028-02-29');
  });

  it('throws a forbidden error with the denial reason', () => {
    const request = {
      actor: owner(502),
      month: september,
      responsibleUnits: [UnitNumber.of(501)],
      today: LocalDate.parse('2026-09-15'),
    };
    expect(() => policy.assertCanWrite(request)).toThrow(withCode('NOT_RESPONSIBLE'));
    expect(() => policy.assertCanWrite({ ...request, actor: owner(501) })).not.toThrow();
  });

  it('rejects a negative or fractional grace period', () => {
    expect(() => new WriteAccessPolicy(-1)).toThrow(withCode('GRACE_DAYS_INVALID'));
    expect(() => new WriteAccessPolicy(1.5)).toThrow(withCode('GRACE_DAYS_INVALID'));
  });

  it('reserves administration to the superadmin', () => {
    expect(() => policy.assertCanAdminister(owner(501))).toThrow(withCode('SUPERADMIN_ONLY'));
    expect(() => policy.assertCanAdminister(superadmin)).not.toThrow();
  });
});
