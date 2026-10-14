import { describe, expect, it } from 'vitest';
import { withCode } from '../../../../test/support/domain-error.js';
import { UnitNumber, YearMonth, YearMonthRange } from '../../../shared-kernel/index.js';
import { Unit } from './unit.js';

const m = (text: string) => YearMonth.parse(text);
const depto301 = UnitNumber.of(301);

describe('Unit', () => {
  it('is active by default', () => {
    const unit = Unit.create(depto301);
    expect(unit.isActiveIn(m('2026-08'))).toBe(true);
    expect(unit.inactivePeriods).toEqual([]);
  });

  it('becomes inactive from a month onwards', () => {
    const unit = Unit.create(depto301);
    unit.deactivate(m('2026-10'));
    expect(unit.isActiveIn(m('2026-09'))).toBe(true);
    expect(unit.isActiveIn(m('2026-10'))).toBe(false);
    expect(unit.isActiveIn(m('2030-01'))).toBe(false);
  });

  it('keeps the inactive period in its history when reactivated', () => {
    const unit = Unit.create(depto301);
    unit.deactivate(m('2026-10'));
    unit.reactivate(m('2027-01'));
    expect(unit.isActiveIn(m('2026-12'))).toBe(false);
    expect(unit.isActiveIn(m('2027-01'))).toBe(true);
    expect(unit.inactivePeriods.map(String)).toEqual(['2026-10..2026-12']);
  });

  it('drops an inactive period that is reactivated before it starts', () => {
    const unit = Unit.create(depto301);
    unit.deactivate(m('2026-10'));
    unit.reactivate(m('2026-10'));
    expect(unit.inactivePeriods).toEqual([]);
  });

  it('refuses to deactivate twice or overlap the history', () => {
    const unit = Unit.create(depto301);
    unit.deactivate(m('2026-10'));
    expect(() => unit.deactivate(m('2026-12'))).toThrow(withCode('UNIT_ALREADY_INACTIVE'));

    unit.reactivate(m('2027-01'));
    expect(() => unit.deactivate(m('2026-11'))).toThrow(withCode('UNIT_ALREADY_INACTIVE'));
    unit.deactivate(m('2027-03'));
    expect(unit.inactivePeriods.map(String)).toEqual(['2026-10..2026-12', '2027-03..']);
  });

  it('refuses to reactivate an active unit or before the inactive period started', () => {
    const unit = Unit.create(depto301);
    expect(() => unit.reactivate(m('2026-10'))).toThrow(withCode('UNIT_NOT_INACTIVE'));
    unit.deactivate(m('2026-10'));
    expect(() => unit.reactivate(m('2026-09'))).toThrow(withCode('UNIT_NOT_INACTIVE'));
  });

  it('restores a consistent history and rejects overlapping periods', () => {
    const restored = Unit.restore(depto301, [
      YearMonthRange.startingAt(m('2027-03')),
      YearMonthRange.between(m('2026-10'), m('2026-12')),
    ]);
    expect(restored.inactivePeriods.map(String)).toEqual(['2026-10..2026-12', '2027-03..']);

    expect(() =>
      Unit.restore(depto301, [
        YearMonthRange.between(m('2026-10'), m('2026-12')),
        YearMonthRange.startingAt(m('2026-12')),
      ]),
    ).toThrow(withCode('UNIT_HISTORY_INVALID'));
  });

  it('keeps its owner’s name, tidied, or none', () => {
    const unit = Unit.create(depto301);
    expect(unit.ownerName).toBeNull();
    unit.renameOwner('  Raúl   Brindis  Hernández ');
    expect(unit.ownerName).toBe('Raúl Brindis Hernández');
    unit.renameOwner('   ');
    expect(unit.ownerName).toBeNull();
    expect(() => unit.renameOwner('x'.repeat(81))).toThrow(withCode('OWNER_NAME_TOO_LONG'));
  });
});
