import { describe, expect, it } from 'vitest';
import { withCode } from '../../../../test/support/domain-error.js';
import { LocalDate, Money, YearMonth } from '../../../shared-kernel/index.js';
import { MonthlyReport, type MonthTotals } from './monthly-report.js';
import { type LiveTotals, ReportLedger } from './report-ledger.js';

const m = (text: string) => YearMonth.parse(text);
const pesos = (amount: number) => Money.ofPesos(amount);
const totals = (income: number, expense: number): MonthTotals => ({
  income: pesos(income),
  expense: pesos(expense),
});

/** Live cashbook totals per month, editable to simulate rows changing. */
function liveBook(initial: Record<string, MonthTotals>): {
  live: LiveTotals;
  set: (month: string, t: MonthTotals) => void;
} {
  const book = new Map(Object.entries(initial));
  return {
    live: (month) => book.get(String(month)) ?? totals(0, 0),
    set: (month, t) => book.set(month, t),
  };
}

const start = { month: m('2026-08'), openingBalance: pesos(10_000) };
/** A day after every month these specs close. */
const later = LocalDate.parse('2026-11-01');
const balances = (ledger: ReportLedger, month: string, live: LiveTotals) => {
  const b = ledger.balancesOf(m(month), live);
  return [b.openingBalance.toString(), b.closingBalance.toString()];
};

describe('MonthlyReport', () => {
  it('closes with a snapshot and reopens without one', () => {
    const report = MonthlyReport.open(m('2026-08'));
    expect(report.status).toBe('OPEN');
    const snapshot = report.close(pesos(1000), totals(7000, 1200));
    expect(snapshot.closingBalance.toString()).toBe('6800.00');
    expect(report.status).toBe('CLOSED');
    expect(() => report.close(pesos(0), totals(0, 0))).toThrow(withCode('MONTH_ALREADY_CLOSED'));

    report.reopen();
    expect(report.snapshot).toBeNull();
    expect(() => report.reopen()).toThrow(withCode('MONTH_NOT_CLOSED'));
    expect(() => report.restate(pesos(0))).toThrow(withCode('MONTH_NOT_CLOSED'));
  });

  it('restates only the balances of a closed month', () => {
    const report = MonthlyReport.open(m('2026-08'));
    report.close(pesos(1000), totals(7000, 1200));
    const restated = report.restate(pesos(2000));
    expect([
      restated.income.toString(),
      restated.expense.toString(),
      restated.closingBalance.toString(),
    ]).toEqual(['7000.00', '1200.00', '7800.00']);
  });

  it('restores stored snapshots, rejecting ones that do not add up', () => {
    const good = {
      openingBalance: pesos(1000),
      income: pesos(700),
      expense: pesos(150),
      closingBalance: pesos(1550),
    };
    expect(MonthlyReport.restore(m('2026-08'), good).status).toBe('CLOSED');
    expect(MonthlyReport.restore(m('2026-08'), null).isOpen).toBe(true);
    expect(() =>
      MonthlyReport.restore(m('2026-08'), { ...good, closingBalance: pesos(1) }),
    ).toThrow(withCode('REPORT_SNAPSHOT_INVALID'));
  });
});

describe('ReportLedger', () => {
  it('opens months in order from the reporting start', () => {
    const ledger = ReportLedger.restore(start, []);
    expect(String(ledger.nextMonth)).toBe('2026-08');
    expect(() => ledger.openMonth(m('2026-09'))).toThrow(withCode('MONTH_OUT_OF_ORDER'));
    ledger.openMonth(m('2026-08'));
    ledger.openMonth(m('2026-09'));
    expect(ledger.reports.map((r) => String(r.month))).toEqual(['2026-08', '2026-09']);
    expect(() => ledger.report(m('2026-10'))).toThrow(withCode('REPORT_NOT_FOUND'));
  });

  it('rejects a stored chain with gaps', () => {
    expect(() => ReportLedger.restore(start, [MonthlyReport.open(m('2026-09'))])).toThrow(
      withCode('REPORT_CHAIN_INVALID'),
    );
  });

  it('carries each closing balance into the next month, live while open', () => {
    const { live } = liveBook({ '2026-08': totals(7000, 1200), '2026-09': totals(6300, 900) });
    const ledger = ReportLedger.restore(start, []);
    ledger.openMonth(m('2026-08'));
    ledger.openMonth(m('2026-09'));

    // Both open (early September): September's opening follows August's live total.
    expect(balances(ledger, '2026-08', live)).toEqual(['10000.00', '15800.00']);
    expect(balances(ledger, '2026-09', live)).toEqual(['15800.00', '21200.00']);

    ledger.closeMonth(m('2026-08'), live, later);
    expect(ledger.report(m('2026-08')).snapshot?.closingBalance.toString()).toBe('15800.00');
    expect(balances(ledger, '2026-09', live)).toEqual(['15800.00', '21200.00']);
  });

  it('closes months in order', () => {
    const { live } = liveBook({});
    const ledger = ReportLedger.restore(start, []);
    ledger.openMonth(m('2026-08'));
    ledger.openMonth(m('2026-09'));
    expect(() => ledger.closeMonth(m('2026-09'), live, later)).toThrow(
      withCode('PREVIOUS_MONTH_OPEN'),
    );
    expect(() => ledger.closeMonth(m('2026-10'), live, later)).toThrow(
      withCode('MONTH_NOT_OPENED'),
    );
    ledger.closeMonth(m('2026-08'), live, later);
    expect(() => ledger.closeMonth(m('2026-08'), live, later)).toThrow(
      withCode('MONTH_ALREADY_CLOSED'),
    );
  });

  it('closes a month only once it is over', () => {
    const { live } = liveBook({});
    const ledger = ReportLedger.restore(start, []);
    ledger.openMonth(m('2026-08'));
    const lastDay = LocalDate.parse('2026-08-31');
    expect(ledger.closingBlocker(m('2026-08'), lastDay)).toEqual(
      expect.objectContaining({ code: 'MONTH_IN_PROGRESS' }),
    );
    expect(() => ledger.closeMonth(m('2026-08'), live, lastDay)).toThrow(
      withCode('MONTH_IN_PROGRESS'),
    );
    expect(ledger.closingBlocker(m('2026-08'), lastDay.plusDays(1))).toBeNull();
  });

  it('freezes closed months even if the cashbook would say otherwise', () => {
    const book = liveBook({ '2026-08': totals(7000, 1200) });
    const ledger = ReportLedger.restore(start, []);
    ledger.openMonth(m('2026-08'));
    ledger.closeMonth(m('2026-08'), book.live, later);
    book.set('2026-08', totals(0, 0));
    expect(balances(ledger, '2026-08', book.live)).toEqual(['10000.00', '15800.00']);
  });

  it('cascades a reopened month into the later closed months when it closes again', () => {
    const book = liveBook({
      '2026-08': totals(7000, 1200),
      '2026-09': totals(6300, 900),
      '2026-10': totals(7000, 1000),
    });
    const ledger = ReportLedger.restore(start, []);
    for (const month of ['2026-08', '2026-09', '2026-10']) ledger.openMonth(m(month));
    ledger.closeMonth(m('2026-08'), book.live, later);
    ledger.closeMonth(m('2026-09'), book.live, later);

    // A forgotten $700 payment in August.
    ledger.reopenMonth(m('2026-08'));
    book.set('2026-08', totals(7700, 1200));
    const changed = ledger.closeMonth(m('2026-08'), book.live, later);

    expect(changed.map((r) => String(r.month))).toEqual(['2026-08', '2026-09']);
    expect(balances(ledger, '2026-09', book.live)).toEqual(['16500.00', '21900.00']);
    expect(balances(ledger, '2026-10', book.live)).toEqual(['21900.00', '27900.00']);
  });

  it('stops the cascade at the first open month', () => {
    const book = liveBook({
      '2026-08': totals(1000, 0),
      '2026-09': totals(1000, 0),
      '2026-10': totals(1000, 0),
    });
    const ledger = ReportLedger.restore(start, []);
    for (const month of ['2026-08', '2026-09', '2026-10']) ledger.openMonth(m(month));
    for (const month of ['2026-08', '2026-09', '2026-10'])
      ledger.closeMonth(m(month), book.live, later);

    ledger.reopenMonth(m('2026-08'));
    ledger.reopenMonth(m('2026-09'));
    book.set('2026-08', totals(2000, 0));
    expect(ledger.closeMonth(m('2026-08'), book.live, later).map((r) => String(r.month))).toEqual([
      '2026-08',
    ]);
    // October keeps its frozen figures until September closes again.
    expect(balances(ledger, '2026-10', book.live)).toEqual(['12000.00', '13000.00']);

    expect(ledger.closeMonth(m('2026-09'), book.live, later).map((r) => String(r.month))).toEqual([
      '2026-09',
      '2026-10',
    ]);
    expect(balances(ledger, '2026-10', book.live)).toEqual(['13000.00', '14000.00']);
  });
});
