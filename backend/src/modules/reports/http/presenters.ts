import type {
  AccountStatement as AccountStatementResponse,
  AccountSummary,
  Movement,
  MonthHistory as MonthHistoryResponse,
  MonthlyReport,
  UnitNumberValue,
} from '@depadmin/shared';
import type { Money, UnitNumber } from '../../../shared-kernel/index.js';
import type { AccountStatement } from '../../billing/application/index.js';
import type { MonthHistory, MonthlyReportView, ReportRow } from '../application/index.js';

const unit = (number: UnitNumber) => number.value as UnitNumberValue;
const centavos = (money: Money) => money.centavos;

export function toAccountSummary(statement: AccountStatement): AccountSummary {
  return {
    unit: unit(statement.unit),
    outstanding: centavos(statement.outstandingBalance),
    credit: centavos(statement.creditBalance),
  };
}

export function toAccountStatement(statement: AccountStatement): AccountStatementResponse {
  return {
    ...toAccountSummary(statement),
    lines: statement.lines.map((line) => ({
      month: String(line.charge.month),
      type: line.charge.type,
      amount: centavos(line.charge.amount),
      paid: centavos(line.paid),
      outstanding: centavos(line.outstanding),
      status: line.status,
    })),
  };
}

function toMovement({ movement, coverage }: ReportRow): Movement {
  const { details } = movement;
  return {
    id: movement.id,
    date: String(details.date),
    category: details.category,
    amount: centavos(details.amount),
    unit: details.unit && unit(details.unit),
    description: details.description,
    week: details.week && String(details.week),
    coverage: coverage.map((c) => ({
      month: String(c.month),
      type: c.type,
      amount: centavos(c.amount),
      settles: c.settles,
    })),
  };
}

export function toMonthlyReport(view: MonthlyReportView): MonthlyReport {
  const { totals, balances, suggestions } = view;
  return {
    month: String(view.month),
    status: view.status,
    reportingStarted: view.reportingStarted,
    balances: balances && {
      opening: centavos(balances.opening),
      closing: centavos(balances.closing),
    },
    totals: {
      income: centavos(totals.income),
      expense: centavos(totals.expense),
      byCategory: {
        UNIT_PAYMENT: centavos(totals.byCategory.UNIT_PAYMENT),
        OTHER_INCOME: centavos(totals.byCategory.OTHER_INCOME),
        GARBAGE: centavos(totals.byCategory.GARBAGE),
        CLEANING: centavos(totals.byCategory.CLEANING),
        OTHER_EXPENSE: centavos(totals.byCategory.OTHER_EXPENSE),
      },
    },
    movements: view.rows.map(toMovement),
    canWrite: view.canWrite,
    canOpen: view.canOpen,
    canClose: view.canClose,
    canReopen: view.canReopen,
    suggestions: suggestions && {
      maintenanceFee: centavos(suggestions.maintenanceFee),
      cleaningPerVisit: centavos(suggestions.cleaningPerVisit),
      garbageWeekly: centavos(suggestions.garbageWeekly),
    },
    accounts: view.accounts.map(toAccountSummary),
    garbageWeeks: view.garbageWeeks.map((week) => ({
      week: String(week.week),
      payday: String(week.payday),
      status: week.status,
      paidBy: week.paidBy && { id: week.paidBy.id, date: String(week.paidBy.date) },
      suggestedDate: String(week.suggestedDate),
    })),
    cleaningPayouts: view.cleaningPayouts.map((payout) => ({
      weekStart: String(payout.weekStart),
      dates: payout.dates.map(String),
      total: centavos(payout.total),
    })),
  };
}

export function toMonthHistory(history: MonthHistory): MonthHistoryResponse {
  return {
    reportingStarted: history.reportingStarted,
    months: history.months.map((entry) => ({
      month: String(entry.month),
      status: entry.status,
      openingBalance: centavos(entry.openingBalance),
      income: centavos(entry.income),
      expense: centavos(entry.expense),
      closingBalance: centavos(entry.closingBalance),
      canClose: entry.canClose,
      canReopen: entry.canReopen,
    })),
  };
}
