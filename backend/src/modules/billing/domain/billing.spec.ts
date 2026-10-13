import { describe, expect, it } from 'vitest';
import { withCode } from '../../../../test/support/domain-error.js';
import { LocalDate, Money, UnitNumber, YearMonth } from '../../../shared-kernel/index.js';
import { AccountStatement } from './account-statement.js';
import { Charge, type ChargeType, missingMaintenanceFees, shiftSkipPenalties } from './charge.js';
import { allocatePayments, type UnitPayment } from './payment-allocation.js';

const depto = UnitNumber.of(301);
const pesos = (amount: number) => Money.ofPesos(amount);
const fee = (
  month: string,
  type: ChargeType = 'MAINTENANCE_FEE',
  amount = type === 'MAINTENANCE_FEE' ? 700 : 500,
) => Charge.create(depto, YearMonth.parse(month), type, pesos(amount));
const pay = (id: string, date: string, amount: number, unit = depto): UnitPayment => ({
  id,
  unit,
  date: LocalDate.parse(date),
  amount: pesos(amount),
});
const allocationsOf = (charges: Charge[], payments: UnitPayment[]) =>
  allocatePayments(depto, charges, payments).allocations.map(
    (a) => `${a.paymentId}->${a.chargeKey}:${a.amount.toString()}`,
  );

describe('Charge', () => {
  it('is identified by depto, month and type', () => {
    expect(fee('2026-09').key).toBe('301:2026-09:MAINTENANCE_FEE');
    expect(() => fee('2026-09', 'MAINTENANCE_FEE', 0)).toThrow(withCode('CHARGE_AMOUNT_INVALID'));
  });

  it('plans the missing fees of a month idempotently', () => {
    const month = YearMonth.parse('2026-09');
    const units = [UnitNumber.of(301), UnitNumber.of(302)];
    const first = missingMaintenanceFees(month, units, pesos(700), []);
    expect(first.map((c) => c.key)).toEqual([
      '301:2026-09:MAINTENANCE_FEE',
      '302:2026-09:MAINTENANCE_FEE',
    ]);
    expect(missingMaintenanceFees(month, units, pesos(700), first)).toEqual([]);
    expect(
      missingMaintenanceFees(month, units, pesos(700), [first[0] as Charge]).map((c) => c.key),
    ).toEqual(['302:2026-09:MAINTENANCE_FEE']);
  });
});

describe('shiftSkipPenalties', () => {
  it('charges the penalty once per skipped month', () => {
    const months = [YearMonth.parse('2026-10'), YearMonth.parse('2026-11')];
    const penalties = shiftSkipPenalties(depto, months, () => pesos(500));
    expect(penalties.map((c) => `${c.key}=${c.amount.toString()}`)).toEqual([
      '301:2026-10:SHIFT_SKIP_PENALTY=500.00',
      '301:2026-11:SHIFT_SKIP_PENALTY=500.00',
    ]);
  });

  it('adds up to $1,200 per month with the regular fee', () => {
    const october = YearMonth.parse('2026-10');
    const charges = [fee('2026-10'), ...shiftSkipPenalties(depto, [october], () => pesos(500))];
    expect(AccountStatement.build(depto, charges, []).outstandingBalance.toString()).toBe(
      '1200.00',
    );
  });
});

describe('allocatePayments (FIFO)', () => {
  const charges = [fee('2026-10'), fee('2026-08'), fee('2026-09')];

  it('covers the oldest charge first', () => {
    expect(allocationsOf(charges, [pay('p1', '2026-10-02', 700)])).toEqual([
      'p1->301:2026-08:MAINTENANCE_FEE:700.00',
    ]);
  });

  it('splits a payment across charges and leaves the rest as credit', () => {
    const result = allocatePayments(depto, charges, [pay('p1', '2026-10-02', 2500)]);
    expect(result.allocations.map((a) => a.amount.toString())).toEqual([
      '700.00',
      '700.00',
      '700.00',
    ]);
    expect(result.unappliedCredit.toString()).toBe('400.00');
  });

  it('completes a partial payment with the next one', () => {
    expect(
      allocationsOf(charges, [pay('p2', '2026-09-20', 500), pay('p1', '2026-08-05', 300)]),
    ).toEqual([
      'p1->301:2026-08:MAINTENANCE_FEE:300.00',
      'p2->301:2026-08:MAINTENANCE_FEE:400.00',
      'p2->301:2026-09:MAINTENANCE_FEE:100.00',
    ]);
  });

  it('breaks ties between same-day payments by id, so the result is deterministic', () => {
    expect(
      allocationsOf([fee('2026-08')], [pay('b', '2026-08-05', 700), pay('a', '2026-08-05', 700)]),
    ).toEqual(['a->301:2026-08:MAINTENANCE_FEE:700.00']);
  });

  it('covers the fee before the skip penalty of the same month', () => {
    const withPenalty = [fee('2026-10', 'SHIFT_SKIP_PENALTY'), fee('2026-10')];
    expect(allocationsOf(withPenalty, [pay('p1', '2026-10-02', 1000)])).toEqual([
      'p1->301:2026-10:MAINTENANCE_FEE:700.00',
      'p1->301:2026-10:SHIFT_SKIP_PENALTY:300.00',
    ]);
  });

  it('keeps everything as credit when nothing is owed', () => {
    const result = allocatePayments(depto, [], [pay('p1', '2026-08-01', 700)]);
    expect(result.allocations).toEqual([]);
    expect(result.unappliedCredit.toString()).toBe('700.00');
  });

  it('refuses to mix deptos', () => {
    expect(() =>
      allocatePayments(depto, charges, [pay('p1', '2026-08-01', 700, UnitNumber.of(302))]),
    ).toThrow(withCode('ALLOCATION_MIXED_UNITS'));
    expect(() =>
      allocatePayments(
        depto,
        [
          Charge.create(
            UnitNumber.of(302),
            YearMonth.parse('2026-08'),
            'MAINTENANCE_FEE',
            pesos(700),
          ),
        ],
        [],
      ),
    ).toThrow(withCode('ALLOCATION_MIXED_UNITS'));
  });
});

describe('AccountStatement', () => {
  const charges = [fee('2026-08'), fee('2026-09'), fee('2026-10')];

  it('derives paid, partial and unpaid charges and the adeudo', () => {
    const statement = AccountStatement.build(depto, charges, [pay('p1', '2026-08-03', 1000)]);
    expect(
      statement.lines.map((line) => [
        String(line.charge.month),
        line.status,
        line.outstanding.toString(),
      ]),
    ).toEqual([
      ['2026-08', 'PAID', '0.00'],
      ['2026-09', 'PARTIAL', '400.00'],
      ['2026-10', 'UNPAID', '700.00'],
    ]);
    expect(statement.outstandingBalance.toString()).toBe('1100.00');
    expect(statement.creditBalance.isZero()).toBe(true);
  });

  it('derives the adelanto', () => {
    const statement = AccountStatement.build(depto, charges, [pay('p1', '2026-08-03', 2800)]);
    expect(statement.outstandingBalance.isZero()).toBe(true);
    expect(statement.creditBalance.toString()).toBe('700.00');
    expect(statement.allocationsMade).toHaveLength(3);
  });

  it('explains what each payment covered', () => {
    const statement = AccountStatement.build(depto, charges, [
      pay('p1', '2026-08-03', 300),
      pay('p2', '2026-09-03', 1500),
    ]);
    const describe = (id: string) =>
      statement
        .coverageOf(id)
        .map((c) => `${c.month} ${c.amount.toString()}${c.settles ? ' liquida' : ''}`);
    expect(describe('p1')).toEqual(['2026-08 300.00']);
    expect(describe('p2')).toEqual([
      '2026-08 400.00 liquida',
      '2026-09 700.00 liquida',
      '2026-10 400.00',
    ]);
    expect(describe('unknown')).toEqual([]);
  });

  it('recomputes from scratch after a payment is edited or removed', () => {
    const before = AccountStatement.build(depto, charges, [pay('p1', '2026-08-03', 2100)]);
    expect(before.outstandingBalance.isZero()).toBe(true);
    const after = AccountStatement.build(depto, charges, [pay('p1', '2026-08-03', 700)]);
    expect(after.outstandingBalance.toString()).toBe('1400.00');
  });
});
