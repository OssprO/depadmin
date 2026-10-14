import type {
  AccountSummary,
  MonthHistory,
  MonthHistoryEntry,
  Movement,
  MonthlyReport,
} from '@depadmin/shared';
import { UNIT_NUMBERS } from '@depadmin/shared';
import { addDays } from '@/lib/format';

const accounts = (owing: Partial<Record<number, number>> = {}): AccountSummary[] =>
  UNIT_NUMBERS.map((unit) => ({ unit, outstanding: owing[unit] ?? 0, credit: 0 }));

export const paymentRow: Movement = {
  id: '5d2c1b0a-9f8e-4d7c-8b6a-5f4e3d2c1b0a',
  date: '2026-10-03',
  category: 'UNIT_PAYMENT',
  amount: 140000,
  unit: 401,
  description: null,
  week: null,
  coverage: [
    { month: '2026-09', type: 'MAINTENANCE_FEE', amount: 70000, settles: true },
    { month: '2026-10', type: 'MAINTENANCE_FEE', amount: 70000, settles: true },
  ],
};

export const cleaningRow: Movement = {
  id: '6e3d2c1b-0a9f-4e8d-9c7b-6a5f4e3d2c1b',
  date: '2026-10-04',
  category: 'CLEANING',
  amount: 27000,
  unit: null,
  description: null,
  week: null,
  coverage: [],
};

export const garbageRow: Movement = {
  id: '7f4e3d2c-1b0a-4f9e-8d7c-7b6a5f4e3d2c',
  date: '2026-10-04',
  category: 'GARBAGE',
  amount: 15000,
  unit: null,
  description: null,
  week: '2026-09-28',
  coverage: [],
};

/** October 2026, open, with a payment and a cleaning visit. */
export function octoberReport(overrides: Partial<MonthlyReport> = {}): MonthlyReport {
  return {
    month: '2026-10',
    status: 'OPEN',
    reportingStarted: true,
    balances: { opening: 500000, closing: 613000 },
    totals: {
      income: 140000,
      expense: 27000,
      byCategory: {
        UNIT_PAYMENT: 140000,
        OTHER_INCOME: 0,
        GARBAGE: 0,
        CLEANING: 27000,
        OTHER_EXPENSE: 0,
      },
    },
    movements: [paymentRow, cleaningRow],
    canWrite: true,
    canOpen: false,
    canClose: false,
    canReopen: false,
    suggestions: { maintenanceFee: 70000, cleaningPerVisit: 27000, garbageWeekly: 15000 },
    accounts: accounts({ 302: 70000, 102: 140000 }),
    // On 14 October three of the weeks have begun and none is paid; the last two are to come.
    garbageWeeks: [
      ['2026-09-28', 'PENDING', '2026-10-03'],
      ['2026-10-05', 'PENDING', '2026-10-10'],
      ['2026-10-12', 'PENDING', '2026-10-14'],
      ['2026-10-19', 'UPCOMING', '2026-10-14'],
      ['2026-10-26', 'UPCOMING', '2026-10-14'],
    ].map(([week = '', status, suggestedDate = '']) => ({
      week,
      payday: addDays(week, 5),
      status: status as 'PENDING' | 'UPCOMING',
      paidBy: null,
      suggestedDate,
    })),
    cleaningPayouts: [{ weekStart: '2026-09-28', dates: ['2026-10-04'], total: 27000 }],
    ...overrides,
  };
}

/** The history on 2 November 2026: October is over and still open; the rest are closed. */
export function historyOf(overrides: Partial<MonthHistoryEntry>[] = []): MonthHistory {
  const months: MonthHistoryEntry[] = [
    ['2026-10', 'OPEN', 570000, 613000],
    ['2026-09', 'CLOSED', 500000, 570000],
    ['2026-08', 'CLOSED', 450000, 500000],
  ].map(([month = '', status, opening = 0, closing = 0]) => ({
    month: String(month),
    status: status as 'OPEN' | 'CLOSED',
    openingBalance: Number(opening),
    income: 140000,
    expense: Number(opening) + 140000 - Number(closing),
    closingBalance: Number(closing),
    canClose: false,
    canReopen: false,
  }));
  return {
    reportingStarted: true,
    months: months.map((entry, i) => ({ ...entry, ...overrides[i] })),
  };
}
