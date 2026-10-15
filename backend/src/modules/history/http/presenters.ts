import type {
  HistoryMonthSummary,
  HistoryPreview,
  HistorySummary,
  PaperMonth,
  PaperSheet as PaperSheetResponse,
  UnitNumberValue,
} from '@depadmin/shared';
import type { Money, UnitNumber } from '../../../shared-kernel/index.js';
import type { HistoryReview, ImportPreview } from '../application/index.js';
import { carriedGap, type MonthReview, ownGap, type PaperSheet } from '../domain/index.js';

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

function toMonthSummary({ review, status }: HistoryReview['months'][number]): HistoryMonthSummary {
  return {
    ...toFigures(review),
    status,
    sheets: review.sheets.length,
    alerts: review.sheets.reduce((count, sheet) => count + sheet.details.alerts.length, 0),
  };
}

export function toHistorySummary(review: HistoryReview): HistorySummary {
  return {
    firstMonth: String(review.firstMonth),
    lastMonth: String(review.lastMonth),
    cutover: String(review.cutover),
    openingBalance: centavos(review.openingBalance),
    closing: centavos(review.closing),
    months: review.months.map(toMonthSummary),
  };
}

export function toHistoryPreview(preview: ImportPreview): HistoryPreview {
  return {
    ...toHistorySummary(preview),
    owners: preview.owners.map((owner) => ({ unit: unit(owner.unit), name: owner.name })),
    movements: preview.movements,
  };
}

function toSheet(sheet: PaperSheet): PaperSheetResponse {
  const { month, fromDay, source, figures, alerts, lines } = sheet.details;
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
    lines: lines.map((line) => ({
      unit: unit(line.unit),
      ownerName: line.ownerName,
      current: maybe(line.current),
      other: maybe(line.other),
      text: line.text,
    })),
  };
}

export function toPaperMonth(review: MonthReview, canEdit: boolean): PaperMonth {
  return { ...toFigures(review), canEdit, sheets: review.sheets.map(toSheet) };
}
