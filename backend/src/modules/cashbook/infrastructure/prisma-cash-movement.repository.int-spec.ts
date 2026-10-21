import { describe, expect, it } from 'vitest';
import { useTestDatabase } from '../../../../test/support/database.js';
import {
  LocalDate,
  Money,
  type MovementDetails,
  UnitNumber,
  YearMonth,
} from '../../../shared-kernel/index.js';
import { CashMovement } from '../domain/index.js';
import { PrismaCashMovementRepository } from './prisma-cash-movement.repository.js';

const ctx = useTestDatabase();
const repository = () => new PrismaCashMovementRepository(ctx.database);
const row = (date: string, details: Partial<MovementDetails> = {}) =>
  CashMovement.record(crypto.randomUUID(), {
    date: LocalDate.parse(date),
    category: 'UNIT_PAYMENT',
    amount: Money.ofPesos(700),
    description: null,
    unit: UnitNumber.of(501),
    week: null,
    ...details,
  });
const garbage = (date: string, week: string) =>
  row(date, {
    category: 'GARBAGE',
    unit: null,
    amount: Money.ofPesos(150),
    week: LocalDate.parse(week),
  });

describe('PrismaCashMovementRepository', () => {
  it('finds the rows of a month by date, including its first and last day', async () => {
    await repository().save([
      row('2026-08-31'),
      row('2026-09-01'),
      garbage('2026-09-30', '2026-09-28'),
      row('2026-10-01'),
    ]);
    const september = await repository().findByMonth(YearMonth.of(2026, 9));
    expect(september.map((r) => `${r.date} ${r.category} ${r.amount}`)).toEqual([
      '2026-09-01 UNIT_PAYMENT 700.00',
      '2026-09-30 GARBAGE 150.00',
    ]);
  });

  it('round-trips revisions and keeps removed rows with their removal time', async () => {
    const payment = row('2026-09-03');
    const other = row('2026-09-04', {
      category: 'OTHER_EXPENSE',
      unit: null,
      description: 'Focos',
      amount: Money.ofPesos(95.5),
    });
    await repository().save([payment, other]);

    payment.revise({ amount: Money.ofPesos(1400) });
    other.remove();
    await repository().save([payment, other]);
    const firstRemoval = await ctx.database.client.cashMovement.findUnique({
      where: { id: other.id },
    });
    await repository().save([other]);
    const secondRemoval = await ctx.database.client.cashMovement.findUnique({
      where: { id: other.id },
    });
    expect(secondRemoval!.removedAt).toEqual(firstRemoval!.removedAt);

    const loaded = await repository().findByMonth(YearMonth.of(2026, 9));
    expect(loaded.map((r) => [r.amount.toString(), r.isRemoved, r.details.description])).toEqual([
      ['1400.00', false, null],
      ['95.50', true, 'Focos'],
    ]);
  });

  it('finds rows between two days, across months', async () => {
    await repository().save([
      row('2026-09-27'),
      row('2026-09-28'),
      row('2026-10-04'),
      row('2026-10-05'),
    ]);
    const span = await repository().findBetween(
      LocalDate.parse('2026-09-28'),
      LocalDate.parse('2026-10-04'),
    );
    expect(span.map((r) => String(r.date))).toEqual(['2026-09-28', '2026-10-04']);
  });

  it('finds the live garbage rows paying for some weeks, wherever they are dated', async () => {
    const removed = garbage('2026-10-11', '2026-10-05');
    removed.remove();
    await repository().save([
      garbage('2026-10-31', '2026-10-26'), // paid early, in October, for November's week
      garbage('2026-11-08', '2026-11-02'),
      garbage('2026-11-30', '2026-11-30'),
      removed,
    ]);
    const weeks = await repository().findGarbageForWeeks(
      LocalDate.parse('2026-10-05'),
      LocalDate.parse('2026-11-23'),
    );
    expect(weeks.map((r) => [String(r.date), String(r.details.week)])).toEqual([
      ['2026-10-31', '2026-10-26'],
      ['2026-11-08', '2026-11-02'],
    ]);
  });

  it('lists the live payments of one depto across months', async () => {
    const removed = row('2026-10-02');
    removed.remove();
    await repository().save([
      row('2026-09-03'),
      row('2026-10-02'),
      row('2026-10-02', { unit: UnitNumber.of(502) }),
      removed,
    ]);
    const payments = await repository().findPaymentsOf(UnitNumber.of(501));
    expect(payments.map((p) => String(p.date))).toEqual(['2026-09-03', '2026-10-02']);
  });

  it('enforces the category rules in the database itself', async () => {
    const insert = (data: {
      category: 'GARBAGE' | 'OTHER_EXPENSE';
      unitNumber?: number;
      description?: string;
    }) =>
      ctx.database.client.cashMovement.create({
        data: { id: crypto.randomUUID(), date: new Date('2026-09-01'), amount: 100, ...data },
      });
    await expect(insert({ category: 'GARBAGE', unitNumber: 501 })).rejects.toThrow(
      /unit_iff_payment|check/i,
    );
    await expect(insert({ category: 'OTHER_EXPENSE', description: '  ' })).rejects.toThrow(
      /description_required|check/i,
    );
  });

  it('keeps one live garbage row per week, named by its Monday, in the database', async () => {
    const insert = (data: { category: 'GARBAGE' | 'CLEANING'; coversWeek?: string }) =>
      ctx.database.client.cashMovement.create({
        data: {
          id: crypto.randomUUID(),
          date: new Date('2026-09-06'),
          amount: 15000,
          category: data.category,
          coversWeek: data.coversWeek ? new Date(data.coversWeek) : null,
        },
      });
    await expect(insert({ category: 'GARBAGE' })).rejects.toThrow(/week_iff_garbage|check/i);
    await expect(insert({ category: 'CLEANING', coversWeek: '2026-08-31' })).rejects.toThrow(
      /week_iff_garbage|check/i,
    );
    await expect(insert({ category: 'GARBAGE', coversWeek: '2026-09-06' })).rejects.toThrow(
      /week_is_monday|check/i,
    );

    const paid = garbage('2026-09-06', '2026-08-31');
    await repository().save([paid]);
    await expect(insert({ category: 'GARBAGE', coversWeek: '2026-08-31' })).rejects.toThrow(
      /one_garbage_per_week|exclusion/i,
    );
    paid.remove();
    await repository().save([paid]);
    await expect(insert({ category: 'GARBAGE', coversWeek: '2026-08-31' })).resolves.toBeDefined();
  });
});
