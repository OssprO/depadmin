import { describe, expect, it } from 'vitest';
import { useTestDatabase } from '../../../../test/support/database.js';
import { LocalDate, Money, YearMonth } from '../../../shared-kernel/index.js';
import type { LiveTotals } from '../domain/index.js';
import { PrismaReportRepository } from './prisma-report.repository.js';

const ctx = useTestDatabase();
const repository = () => new PrismaReportRepository(ctx.database);
const m = (text: string) => YearMonth.parse(text);
const live: LiveTotals = () => ({ income: Money.ofPesos(7000), expense: Money.ofPesos(1200) });
const start = { month: m('2026-08'), openingBalance: Money.ofPesos(10_000), cutover: m('2026-08') };
const later = LocalDate.parse('2026-11-01');

describe('PrismaReportRepository', () => {
  it('has no ledger until the reporting start is set', async () => {
    expect(await repository().loadLedger()).toBeNull();
  });

  it('round-trips open and closed months', async () => {
    await repository().saveStart(start);
    const ledger = (await repository().loadLedger())!;
    const opened = [ledger.openMonth(m('2026-08')), ledger.openMonth(m('2026-09'))];
    await repository().save(opened);
    await repository().save(ledger.closeMonth(m('2026-08'), live, later));

    const loaded = (await repository().loadLedger())!;
    expect(loaded.reports.map((r) => [String(r.month), r.status])).toEqual([
      ['2026-08', 'CLOSED'],
      ['2026-09', 'OPEN'],
    ]);
    expect(loaded.balancesOf(m('2026-09'), live).openingBalance.toString()).toBe('15800.00');
    expect(String(loaded.start.month)).toBe('2026-08');
  });

  it('clears the snapshot on reopen and keeps the closing time when restating', async () => {
    await repository().saveStart(start);
    const ledger = (await repository().loadLedger())!;
    await repository().save([ledger.openMonth(m('2026-08')), ledger.openMonth(m('2026-09'))]);
    await repository().save(ledger.closeMonth(m('2026-08'), live, later));
    await repository().save(ledger.closeMonth(m('2026-09'), live, later));
    const septemberClosedAt = (await ctx.database.client.monthlyReport.findFirst({
      where: { month: new Date('2026-09-01') },
    }))!.closedAt;

    await repository().save([ledger.reopenMonth(m('2026-08'))]);
    const reopened = await ctx.database.client.monthlyReport.findFirst({
      where: { month: new Date('2026-08-01') },
    });
    expect(reopened).toMatchObject({ closedAt: null, openingBalance: null, closingBalance: null });

    await repository().save(
      ledger.closeMonth(
        m('2026-08'),
        () => ({ income: Money.ofPesos(7700), expense: Money.ZERO }),
        later,
      ),
    );
    const september = await ctx.database.client.monthlyReport.findFirst({
      where: { month: new Date('2026-09-01') },
    });
    expect(september!.openingBalance).toBe(1_770_000);
    expect(september!.closedAt).toEqual(septemberClosedAt);
  });

  it('updates the reporting start', async () => {
    await repository().saveStart(start);
    await repository().saveStart({ ...start, openingBalance: Money.ofPesos(12_000) });
    expect((await repository().loadLedger())!.start.openingBalance.toString()).toBe('12000.00');
  });

  it('keeps the cut-over of books that start with the history', async () => {
    await repository().saveStart({ ...start, month: m('2022-05'), cutover: m('2026-08') });
    const { start: loaded } = (await repository().loadLedger())!;
    expect([String(loaded.month), String(loaded.cutover)]).toEqual(['2022-05', '2026-08']);
  });

  it('rejects inconsistent snapshots in the database itself', async () => {
    await expect(
      ctx.database.client.monthlyReport.create({
        data: {
          month: new Date('2026-08-01'),
          closedAt: new Date(),
          openingBalance: 0,
          income: 1,
          expense: 0,
          closingBalance: 5,
        },
      }),
    ).rejects.toThrow(/snapshot_consistent|check/i);
  });
});
