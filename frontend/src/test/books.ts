import type { AccountSummary, Movement, MonthlyReport } from '@depadmin/shared';
import { UNIT_NUMBERS } from '@depadmin/shared';

const accounts = (owing: Partial<Record<number, number>> = {}): AccountSummary[] =>
  UNIT_NUMBERS.map((unit) => ({ unit, outstanding: owing[unit] ?? 0, credit: 0 }));

export const paymentRow: Movement = {
  id: '5d2c1b0a-9f8e-4d7c-8b6a-5f4e3d2c1b0a',
  date: '2026-10-03',
  category: 'UNIT_PAYMENT',
  amount: 140000,
  unit: 401,
  description: null,
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
    suggestions: { maintenanceFee: 70000, cleaningPerVisit: 27000, garbageWeekly: 15000 },
    accounts: accounts({ 302: 70000, 102: 140000 }),
    ...overrides,
  };
}
