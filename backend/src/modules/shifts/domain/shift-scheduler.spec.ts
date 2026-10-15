import { describe, expect, it } from 'vitest';
import { withCode } from '../../../../test/support/domain-error.js';
import { YearMonthRange } from '../../../shared-kernel/index.js';
import { ShiftDelegation } from './shift-delegation.js';
import { ShiftRotation } from './shift-rotation.js';
import { ShiftScheduler, type UnitAvailability } from './shift-scheduler.js';
import { availability, delegation, m, u } from './testing.js';

const scheduler = new ShiftScheduler(new ShiftRotation());
const responsible = (
  month: string,
  delegations: readonly ShiftDelegation[] = [],
  units: UnitAvailability = availability(),
) =>
  scheduler.assignmentFor(m(month), delegations, units).responsibleUnits.map((unit) => unit.value);

describe('ShiftScheduler', () => {
  describe('without exceptions', () => {
    it('makes the scheduled depto responsible', () => {
      const assignment = scheduler.assignmentFor(m('2026-10'), [], availability());
      expect(assignment.scheduledUnit.value).toBe(502);
      expect(assignment.scheduledUnitActive).toBe(true);
      expect(assignment.delegation).toBeNull();
      expect(responsible('2026-10')).toEqual([502]);
    });

    it("has nobody responsible before the rotation begins (the building's history)", () => {
      const july = scheduler.assignmentFor(m('2026-07'), [], availability());
      expect(july).toMatchObject({ beforeRotation: true, responsibleUnits: [] });
      expect(scheduler.assignmentFor(m('2026-08'), [], availability()).beforeRotation).toBe(false);
    });

    it('builds a calendar for a range of months', () => {
      const calendar = scheduler.calendar(m('2026-08'), m('2026-12'), [], availability());
      expect(calendar.map((a) => [String(a.month), a.scheduledUnit.value])).toEqual([
        ['2026-08', 501],
        ['2026-09', 501],
        ['2026-10', 502],
        ['2026-11', 502],
        ['2026-12', 401],
      ]);
    });
  });

  describe('delegations', () => {
    const skip = delegation('2026-10..2026-11', 502, 501);

    it('lets both the original and the delegate write during the delegation', () => {
      expect(responsible('2026-10', [skip])).toEqual([502, 501]);
      expect(responsible('2026-11', [skip])).toEqual([502, 501]);
      expect(responsible('2026-12', [skip])).toEqual([401]);
    });

    it('can cover a single month of the period', () => {
      const oneMonth = delegation('2026-11', 502, 401, 'OTHER');
      expect(responsible('2026-10', [oneMonth])).toEqual([502]);
      expect(responsible('2026-11', [oneMonth])).toEqual([502, 401]);
    });

    it('stops applying once cancelled', () => {
      const cancelled = delegation('2026-10..2026-11', 502, 501);
      cancelled.cancel();
      expect(responsible('2026-10', [cancelled])).toEqual([502]);
      expect(() => cancelled.cancel()).toThrow(withCode('DELEGATION_ALREADY_CANCELLED'));
    });

    it('fails loudly if stored delegations overlap', () => {
      const other = delegation('2026-11', 502, 401, 'OTHER');
      expect(() => responsible('2026-11', [skip, other])).toThrow(withCode('DELEGATIONS_OVERLAP'));
    });
  });

  describe('inactive deptos', () => {
    // 502 is inactive from October 2026; the calendar of everyone else does not move.
    const inactive502 = availability({ 502: YearMonthRange.startingAt(m('2026-10')) });

    it('keeps the calendar but leaves the period without anyone responsible', () => {
      const assignment = scheduler.assignmentFor(m('2026-10'), [], inactive502);
      expect(assignment.scheduledUnit.value).toBe(502);
      expect(assignment.scheduledUnitActive).toBe(false);
      expect(assignment.responsibleUnits).toEqual([]);
      expect(responsible('2026-12', [], inactive502)).toEqual([401]);
    });

    it('is covered only by the delegate the superadmin assigns', () => {
      const cover = delegation('2026-10..2026-11', 502, 402, 'INACTIVE_UNIT');
      expect(responsible('2026-10', [cover], inactive502)).toEqual([402]);
    });

    it('drops a delegate that later became inactive', () => {
      const cover = delegation('2026-10..2026-11', 502, 402, 'INACTIVE_UNIT');
      const bothInactive = availability({
        502: YearMonthRange.startingAt(m('2026-10')),
        402: YearMonthRange.single(m('2026-11')),
      });
      expect(responsible('2026-10', [cover], bothInactive)).toEqual([402]);
      expect(responsible('2026-11', [cover], bothInactive)).toEqual([]);
    });
  });

  describe('assertCanDelegate', () => {
    const units = availability({ 302: YearMonthRange.startingAt(m('2027-06')) });
    const check =
      (
        candidate: ReturnType<typeof delegation>,
        existing = [] as ReturnType<typeof delegation>[],
      ) =>
      () =>
        scheduler.assertCanDelegate(candidate, existing, units);

    it('accepts a valid skip and a valid cover', () => {
      expect(check(delegation('2026-10..2026-11', 502, 501))).not.toThrow();
      // 302 holds 2027-06..2027-07 and is inactive then.
      expect(check(delegation('2027-06..2027-07', 302, 301, 'INACTIVE_UNIT'))).not.toThrow();
    });

    it('has nothing to delegate before the rotation begins', () => {
      expect(check(delegation('2026-06..2026-07', 301, 501))).toThrow(
        withCode('DELEGATION_INVALID'),
      );
    });

    it('requires staying inside one scheduled period', () => {
      expect(check(delegation('2026-09..2026-10', 501, 502))).toThrow(
        withCode('DELEGATION_INVALID'),
      );
    });

    it('requires the scheduled depto as the original', () => {
      expect(check(delegation('2026-10..2026-11', 401, 402))).toThrow(
        withCode('DELEGATION_INVALID'),
      );
    });

    it('requires an active delegate', () => {
      expect(check(delegation('2027-08..2027-09', 201, 302, 'OTHER'))).toThrow(
        withCode('DELEGATE_INACTIVE'),
      );
    });

    it('matches the reason to the original depto status', () => {
      expect(check(delegation('2027-06..2027-07', 302, 301, 'SKIPPED_SHIFT'))).toThrow(
        withCode('DELEGATION_INVALID'),
      );
      expect(check(delegation('2026-10..2026-11', 502, 501, 'INACTIVE_UNIT'))).toThrow(
        withCode('DELEGATION_INVALID'),
      );
    });

    it('rejects overlaps with active delegations only', () => {
      const existing = delegation('2026-11', 502, 401, 'OTHER', 'existing');
      expect(check(delegation('2026-10..2026-11', 502, 501), [existing])).toThrow(
        withCode('DELEGATIONS_OVERLAP'),
      );
      existing.cancel();
      expect(check(delegation('2026-10..2026-11', 502, 501), [existing])).not.toThrow();
    });

    it('ignores the candidate itself when re-validating it', () => {
      const candidate = delegation('2026-10..2026-11', 502, 501, 'SKIPPED_SHIFT', 'same');
      expect(check(candidate, [candidate])).not.toThrow();
    });
  });

  describe('assertIsHandover', () => {
    it('accepts a skip that starts the next period, for one or both months', () => {
      expect(() =>
        scheduler.assertIsHandover(delegation('2026-10..2026-11', 502, 501)),
      ).not.toThrow();
      expect(() => scheduler.assertIsHandover(delegation('2026-10', 502, 401))).not.toThrow();
    });

    it('rejects handovers in the middle of a period or with another reason', () => {
      expect(() => scheduler.assertIsHandover(delegation('2026-11', 502, 501))).toThrow(
        withCode('HANDOVER_INVALID'),
      );
      expect(() =>
        scheduler.assertIsHandover(delegation('2026-10..2026-11', 502, 501, 'OTHER')),
      ).toThrow(withCode('HANDOVER_INVALID'));
    });
  });

  describe('ShiftDelegation', () => {
    it('rejects self-delegation and open-ended ranges', () => {
      expect(() => delegation('2026-10..2026-11', 502, 502)).toThrow(
        withCode('DELEGATION_INVALID'),
      );
      const openEnded = () =>
        ShiftDelegation.create({
          id: 'open',
          months: YearMonthRange.startingAt(m('2026-10')),
          originalUnit: u(502),
          delegateUnit: u(501),
          reason: 'OTHER',
        });
      expect(openEnded).toThrow(withCode('DELEGATION_INVALID'));
    });
  });
});
