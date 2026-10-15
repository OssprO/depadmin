import type {
  HistoricalMonth,
  HistoricalSheet,
  HistoryMonthSummary,
  HistoryPreview,
  HistorySummary,
  Movement,
  UnitNumberValue,
} from '@depadmin/shared';
import type { Money, UnitNumber } from '../../../shared-kernel/index.js';
import type { HistoryReview, ImportPreview } from '../application/index.js';
import {
  carriedGap,
  type HistoricalBooks,
  type HistoricalMovement,
  type MonthReview,
  ownGap,
  type PaperSheet,
} from '../domain/index.js';

const unit = (number: UnitNumber) => number.value as UnitNumberValue;
const centavos = (money: Money) => money.centavos;
const maybe = (money: Money | null) => money && money.centavos;

function toFigures(review: MonthReview) {
  return {
    month: String(review.month),
    opening: centavos(review.opening),
    income: centavos(review.income),
    expense: centavos(review.expense),
    closing: centavos(review.closing),
    paperOpening: maybe(review.paperOpening),
    paperClosing: maybe(review.paperClosing),
    paperIncome: maybe(review.paperIncome),
    paperExpense: maybe(review.paperExpense),
    ownGap: maybe(ownGap(review)),
    carriedGap: maybe(carriedGap(review)),
  };
}

function toMonthSummary(review: MonthReview): HistoryMonthSummary {
  return {
    ...toFigures(review),
    sheets: review.sheets.length,
    movements: review.movements.length,
    alerts: review.sheets.reduce((count, sheet) => count + sheet.details.alerts.length, 0),
  };
}

export function toHistorySummary(review: HistoryReview): HistorySummary {
  const { books, cutover } = review;
  return {
    status: books.status,
    firstMonth: String(books.firstMonth),
    lastMonth: String(books.lastMonth),
    openingBalance: centavos(books.openingBalance),
    closing: centavos(review.closing),
    months: review.months.map(toMonthSummary),
    cutover: cutover && {
      month: String(cutover.month),
      openingBalance: centavos(cutover.openingBalance),
      difference: maybe(cutover.difference),
    },
  };
}

export function toHistoryPreview(preview: ImportPreview): HistoryPreview {
  return {
    ...toHistorySummary(preview),
    owners: preview.owners.map((owner) => ({ unit: unit(owner.unit), name: owner.name })),
  };
}

function toSheet(sheet: PaperSheet): HistoricalSheet {
  const { month, fromDay, source, figures, alerts, notes } = sheet.details;
  return {
    id: sheet.id,
    month: String(month),
    fromDay,
    source,
    opening: maybe(figures.opening),
    income: maybe(figures.income),
    expense: maybe(figures.expense),
    closing: maybe(figures.closing),
    alerts: [...alerts],
    notes: notes.map((note) => ({ unit: unit(note.unit), text: note.text })),
  };
}

function toMovement(movement: HistoricalMovement): Movement {
  const { details } = movement;
  return {
    id: movement.id,
    date: String(details.date),
    category: details.category,
    amount: centavos(details.amount),
    unit: details.unit && unit(details.unit),
    description: details.description,
    week: details.week && String(details.week),
    coverage: [],
  };
}

export function toHistoricalMonth(books: HistoricalBooks, review: MonthReview): HistoricalMonth {
  const { month } = review;
  return {
    ...toFigures(review),
    canEdit: books.status === 'IN_REVIEW',
    previous: month.equals(books.firstMonth) ? null : String(month.previous()),
    next: month.equals(books.lastMonth) ? null : String(month.next()),
    sheets: review.sheets.map(toSheet),
    movements: review.movements.map(toMovement),
  };
}
