import { describe, expect, it } from 'vitest';
import { withCode } from '../../../../test/support/domain-error.js';
import { LocalDate, UnitNumber, YearMonth } from '../../../shared-kernel/index.js';
import type { Actor } from './actor.js';
import { type ShiftResponsibility, WriteAccessPolicy } from './write-access-policy.js';

const policy = new WriteAccessPolicy();
const m = (text: string) => YearMonth.parse(text);
const owner = (unit: number): Actor => ({
  role: 'OWNER',
  userId: `u${unit}`,
  unit: UnitNumber.of(unit),
});
const superadmin: Actor = { role: 'SUPERADMIN', userId: 'admin' };

/** Who answers for each month; months not listed have nobody. */
function shifts(table: Record<string, number[]>): ShiftResponsibility {
  return {
    isResponsible: (unit, month) => table[String(month)]?.includes(unit.value) ?? false,
  };
}

// 501 holds August and September, 502 October and November.
const normal = shifts({
  '2026-08': [501],
  '2026-09': [501],
  '2026-10': [502],
  '2026-11': [502],
});

const decide = (actor: Actor, month: string, today: string, responsibility = normal) =>
  policy.decide({ actor, month: m(month), today: LocalDate.parse(today), responsibility });

const denied = (reason: string) => ({ allowed: false, reason });
const allowed = { allowed: true };

describe('WriteAccessPolicy', () => {
  it('lets the holder write their months during the shift', () => {
    expect(decide(owner(501), '2026-08', '2026-08-01')).toEqual(allowed);
    expect(decide(owner(501), '2026-09', '2026-09-30')).toEqual(allowed);
  });

  it('keeps earlier months of the same shift writable while it lasts', () => {
    expect(decide(owner(501), '2026-08', '2026-09-20')).toEqual(allowed);
    expect(decide(owner(501), '2026-08', '2026-10-05')).toEqual(allowed);
  });

  it('gives five days after the shift ends to square the books', () => {
    expect(decide(owner(501), '2026-09', '2026-10-01')).toEqual(allowed);
    expect(decide(owner(501), '2026-09', '2026-10-05')).toEqual(allowed);
    expect(decide(owner(501), '2026-09', '2026-10-06')).toEqual(denied('OUTSIDE_WRITE_WINDOW'));
    expect(decide(owner(501), '2026-08', '2026-10-06')).toEqual(denied('OUTSIDE_WRITE_WINDOW'));
  });

  it('does not open a month before it starts', () => {
    expect(decide(owner(501), '2026-09', '2026-08-31')).toEqual(denied('OUTSIDE_WRITE_WINDOW'));
  });

  it('gives the next holder no access to the previous shift', () => {
    expect(decide(owner(502), '2026-09', '2026-10-03')).toEqual(denied('NOT_RESPONSIBLE'));
  });

  it('extends the window when the holder keeps the next shift by delegation', () => {
    // 502 skipped; 501 stays on for October and November with 502.
    const kept = shifts({
      '2026-08': [501],
      '2026-09': [501],
      '2026-10': [502, 501],
      '2026-11': [502, 501],
    });
    expect(decide(owner(501), '2026-08', '2026-11-20', kept)).toEqual(allowed);
    expect(decide(owner(501), '2026-09', '2026-12-05', kept)).toEqual(allowed);
    expect(decide(owner(501), '2026-09', '2026-12-06', kept)).toEqual(
      denied('OUTSIDE_WRITE_WINDOW'),
    );
    expect(decide(owner(502), '2026-10', '2026-12-05', kept)).toEqual(allowed);
  });

  it('lets only the superadmin write a month nobody is responsible for', () => {
    expect(decide(owner(501), '2026-12', '2026-12-10')).toEqual(denied('NOT_RESPONSIBLE'));
    expect(decide(superadmin, '2026-12', '2026-12-10')).toEqual(allowed);
    expect(decide(superadmin, '2026-01', '2030-01-01')).toEqual(allowed);
  });

  it('exposes the window for the UI', () => {
    const window = policy.windowFor(UnitNumber.of(501), m('2026-08'), normal);
    expect([String(window?.from), String(window?.to)]).toEqual(['2026-08-01', '2026-10-05']);
    expect(policy.windowFor(UnitNumber.of(502), m('2026-08'), normal)).toBeNull();

    const noGrace = new WriteAccessPolicy(0).windowFor(
      UnitNumber.of(101),
      m('2028-02'),
      shifts({ '2028-02': [101] }),
    );
    expect(String(noGrace?.to)).toBe('2028-02-29');
  });

  it('bounds an endless responsibility streak', () => {
    const forever: ShiftResponsibility = { isResponsible: () => true };
    const window = policy.windowFor(UnitNumber.of(101), m('2026-01'), forever);
    expect(String(window?.to)).toBe('2036-02-05');
  });

  it('rejects a negative or fractional grace period', () => {
    expect(() => new WriteAccessPolicy(-1)).toThrow(withCode('GRACE_DAYS_INVALID'));
    expect(() => new WriteAccessPolicy(1.5)).toThrow(withCode('GRACE_DAYS_INVALID'));
  });

  describe('assertions', () => {
    const request = (actor: Actor, month: string, today: string) => ({
      actor,
      month: m(month),
      today: LocalDate.parse(today),
      responsibility: normal,
    });

    it('writes and closes under the same rule', () => {
      expect(() =>
        policy.assertCanWrite(request(owner(501), '2026-09', '2026-10-03')),
      ).not.toThrow();
      expect(() =>
        policy.assertCanClose(request(owner(501), '2026-09', '2026-10-03')),
      ).not.toThrow();
      expect(() => policy.assertCanWrite(request(owner(502), '2026-09', '2026-10-03'))).toThrow(
        withCode('NOT_RESPONSIBLE'),
      );
      expect(() => policy.assertCanClose(request(owner(501), '2026-09', '2026-10-06'))).toThrow(
        withCode('OUTSIDE_WRITE_WINDOW'),
      );
    });

    it('lets the outgoing holder decide the next handover during their window', () => {
      const handOver = (actor: Actor, today: string) => () =>
        policy.assertCanHandOver({
          actor,
          firstMonth: m('2026-10'),
          today: LocalDate.parse(today),
          responsibility: normal,
        });
      expect(handOver(owner(501), '2026-09-25')).not.toThrow();
      expect(handOver(owner(501), '2026-10-05')).not.toThrow();
      expect(handOver(owner(501), '2026-10-06')).toThrow(withCode('OUTSIDE_WRITE_WINDOW'));
      expect(handOver(owner(502), '2026-10-02')).toThrow(withCode('NOT_RESPONSIBLE'));
      expect(handOver(superadmin, '2027-01-01')).not.toThrow();
    });

    it('reserves administration to the superadmin', () => {
      expect(() => policy.assertCanAdminister(owner(501))).toThrow(withCode('SUPERADMIN_ONLY'));
      expect(() => policy.assertCanAdminister(superadmin)).not.toThrow();
    });
  });
});
