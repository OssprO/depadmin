import { describe, expect, it } from 'vitest';
import { RecordingAuditTrail, FakeUnitOfWork } from '../../../../test/support/audit-trail.js';
import { FixedClock } from '../../../../test/support/clock.js';
import { withCode } from '../../../../test/support/domain-error.js';
import { FakeMonthLedger } from '../../../../test/support/month-ledger.js';
import { FakeShiftRoster } from '../../../../test/support/shift-roster.js';
import {
  type Actor,
  LocalDate,
  Money,
  UnitNumber,
  YearMonth,
} from '../../../shared-kernel/index.js';
import { ChangeRate, type ChangeRateCommand, WithdrawRateChange } from './change-rates.js';
import { GetRates } from './get-rates.js';
import { GetRateSchedule } from './rate-schedule.js';
import { initialRateSettings } from './testing.js';

const m = (text: string) => YearMonth.parse(text);
const owner = (unit: number): Actor => ({
  role: 'OWNER',
  userId: `u${unit}`,
  unit: UnitNumber.of(unit),
});
const superadmin: Actor = { role: 'SUPERADMIN', userId: 'admin' };
const tenant: Actor = { role: 'READER', userId: 'r', unit: UnitNumber.of(502) };

/** On 17 November 2026: 502 holds October and November, 401 December and January. */
function ratesFixture(today = '2026-11-17') {
  const settings = initialRateSettings();
  const unitOfWork = new FakeUnitOfWork();
  const audit = new RecordingAuditTrail(unitOfWork);
  const clock = FixedClock.on(today);
  const months = new FakeMonthLedger().set('2026-10', 'CLOSED').set('2026-11', 'OPEN');
  const roster = new FakeShiftRoster({
    '2026-10': [502],
    '2026-11': [502],
    '2026-12': [401],
    '2027-01': [401],
  });
  return {
    settings,
    audit,
    clock,
    months,
    rates: new GetRates(settings),
    change: new ChangeRate(settings, unitOfWork, audit, clock, months, roster),
    withdraw: new WithdrawRateChange(settings, unitOfWork, audit, clock, months, roster),
    schedule: new GetRateSchedule(settings, clock, months, roster),
  };
}

const feeFromJanuary: ChangeRateCommand = {
  rate: 'maintenanceFee',
  from: m('2027-01'),
  amount: Money.ofPesos(800),
  agreedOn: LocalDate.parse('2026-11-10'),
  agreement: 'Asamblea del 10 de noviembre: la cuota sube a $800',
};

describe('ChangeRate', () => {
  it('lets the shift administrator schedule a new rate, audited with its agreement', async () => {
    const fx = ratesFixture();

    await fx.change.execute(owner(502), feeFromJanuary);

    expect(String((await fx.rates.forMonth(m('2026-12'))).maintenanceFee)).toBe('700.00');
    expect(String((await fx.rates.forMonth(m('2027-01'))).maintenanceFee)).toBe('800.00');
    expect(fx.settings.locks).toBe(1);
    expect(fx.audit.entries).toEqual([
      {
        actor: owner(502),
        change: {
          action: 'RATE_CHANGE_SCHEDULED',
          entity: 'rate_change',
          entityId: 'maintenanceFee:2027-01-01',
          entityLabel: '2027-01',
          changes: [
            { field: 'rate', before: null, after: 'maintenanceFee' },
            { field: 'effectiveFrom', before: null, after: '2027-01-01' },
            { field: 'amount', before: null, after: 80_000 },
            { field: 'agreedOn', before: null, after: '2026-11-10' },
            { field: 'agreement', before: null, after: feeFromJanuary.agreement },
          ],
        },
      },
    ]);
  });

  it('is only for the shift administrator: not the superadmin, a reader or another depto', async () => {
    const fx = ratesFixture();

    await expect(fx.change.execute(superadmin, feeFromJanuary)).rejects.toThrow(
      withCode('SHIFT_ADMIN_ONLY'),
    );
    await expect(fx.change.execute(owner(401), feeFromJanuary)).rejects.toThrow(
      withCode('SHIFT_ADMIN_ONLY'),
    );
    await expect(fx.change.execute(tenant, feeFromJanuary)).rejects.toThrow(withCode('READ_ONLY'));
    expect(fx.audit.entries).toEqual([]);
  });

  it('applies from a month that has not opened: never this one once open, nor the past', async () => {
    const fx = ratesFixture();
    const from = (month: string) =>
      fx.change.execute(owner(502), { ...feeFromJanuary, from: m(month) });

    await expect(from('2026-11')).rejects.toThrow(withCode('RATE_CHANGE_TOO_EARLY'));
    await expect(from('2026-10')).rejects.toThrow(withCode('RATE_CHANGE_TOO_EARLY'));
    await from('2026-12');

    // If the job has not opened the month yet, it is still in time.
    const early = ratesFixture('2026-12-01');
    early.months.set('2026-11', 'OPEN');
    await early.change.execute(owner(401), { ...feeFromJanuary, from: m('2026-12') });
    expect(String((await early.rates.forMonth(m('2026-12'))).maintenanceFee)).toBe('800.00');
  });

  it('only adds after the latest change, and needs an agreement from the past', async () => {
    const fx = ratesFixture();
    await fx.change.execute(owner(502), feeFromJanuary);

    await expect(
      fx.change.execute(owner(502), { ...feeFromJanuary, from: m('2026-12') }),
    ).rejects.toThrow(withCode('RATE_CHANGE_NOT_LATEST'));
    await expect(
      fx.change.execute(owner(502), {
        ...feeFromJanuary,
        from: m('2027-02'),
        agreedOn: LocalDate.parse('2026-11-18'),
      }),
    ).rejects.toThrow(withCode('RATE_AGREEMENT_INVALID'));
    await expect(
      fx.change.execute(owner(502), { ...feeFromJanuary, from: m('2027-02'), agreement: ' ' }),
    ).rejects.toThrow(withCode('RATE_AGREEMENT_INVALID'));
    await expect(
      fx.change.execute(owner(502), {
        ...feeFromJanuary,
        from: m('2027-02'),
        amount: Money.ZERO,
      }),
    ).rejects.toThrow(withCode('RATE_INVALID'));
    expect(fx.audit.actions).toEqual(['RATE_CHANGE_SCHEDULED']);
  });
});

describe('WithdrawRateChange', () => {
  it('takes back a scheduled change, audited', async () => {
    const fx = ratesFixture();
    await fx.change.execute(owner(502), feeFromJanuary);

    await fx.withdraw.execute(owner(502), 'maintenanceFee', m('2027-01'));

    expect(String((await fx.rates.forMonth(m('2027-01'))).maintenanceFee)).toBe('700.00');
    expect(fx.audit.actions).toEqual(['RATE_CHANGE_SCHEDULED', 'RATE_CHANGE_WITHDRAWN']);
    expect(fx.audit.entries[1]?.change.changes[2]).toEqual({
      field: 'amount',
      before: 80_000,
      after: null,
    });
  });

  it('leaves alone what a month already charged, and is the shift administrator’s', async () => {
    const fx = ratesFixture();
    await fx.change.execute(owner(502), feeFromJanuary);

    await expect(fx.withdraw.execute(superadmin, 'maintenanceFee', m('2027-01'))).rejects.toThrow(
      withCode('SHIFT_ADMIN_ONLY'),
    );
    await expect(fx.withdraw.execute(owner(502), 'maintenanceFee', m('2026-08'))).rejects.toThrow(
      withCode('RATE_CHANGE_FIRST'),
    );
    await expect(fx.withdraw.execute(owner(502), 'garbageWeekly', m('2027-01'))).rejects.toThrow(
      withCode('RATE_CHANGE_NOT_FOUND'),
    );

    // Once its month opens, the change is history: it already charged the fees.
    const december = ratesFixture('2026-12-01');
    december.months.set('2026-11', 'OPEN');
    await december.change.execute(owner(401), { ...feeFromJanuary, from: m('2026-12') });
    december.months.set('2026-12', 'OPEN');
    await expect(
      december.withdraw.execute(owner(401), 'maintenanceFee', m('2026-12')),
    ).rejects.toThrow(withCode('RATE_CHANGE_TOO_EARLY'));
  });
});

describe('GetRateSchedule', () => {
  it('shows everyone the rates, and the shift administrator when they can change', async () => {
    const fx = ratesFixture();
    await fx.change.execute(owner(502), feeFromJanuary);

    const asOwner = await fx.schedule.execute(owner(502));
    const asTenant = await fx.schedule.execute(tenant);

    expect(asOwner.canChange).toBe(true);
    expect(asTenant.canChange).toBe(false);
    expect((await fx.schedule.execute(superadmin)).canChange).toBe(false);
    expect(
      asOwner.rates.map((r) => [
        r.rate,
        String(r.current),
        String(r.earliestMonth),
        r.history.length,
      ]),
    ).toEqual([
      ['maintenanceFee', '700.00', '2027-02', 2],
      ['cleaningPerVisit', '270.00', '2026-12', 1],
      ['garbageWeekly', '150.00', '2026-12', 1],
      ['shiftSkipPenalty', '500.00', '2026-12', 1],
    ]);
    expect(asOwner.rates[0]?.history[1]?.agreement?.summary).toBe(feeFromJanuary.agreement);
    expect(asOwner.rates[0]?.history.map((c) => [c.upcoming, c.withdrawable])).toEqual([
      [false, false],
      [true, true],
    ]);
    expect(asTenant.rates[0]?.history[1]?.withdrawable).toBe(false);
  });

  it('offers the current month while it has not opened', async () => {
    const fx = ratesFixture('2026-12-01');
    fx.months.set('2026-11', 'OPEN');

    const { rates } = await fx.schedule.execute(owner(401));

    expect(String(rates[1]?.earliestMonth)).toBe('2026-12');
  });
});
