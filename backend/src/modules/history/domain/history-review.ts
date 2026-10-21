import { Money, type YearMonth } from '../../../shared-kernel/index.js';
import type { PaperSheet } from './paper-sheet.js';

/** A month as the books add it up: carried in, taken in, paid out and carried on. */
export interface MonthFigures {
  readonly month: YearMonth;
  readonly opening: Money;
  readonly income: Money;
  readonly expense: Money;
  readonly closing: Money;
}

/** A month of the history as its rows add up, next to what its paper sheets say. */
export interface MonthReview extends MonthFigures {
  /** Its sheets in order; none when the paper is missing. */
  readonly sheets: readonly PaperSheet[];
  /** What the first sheet opens with and the last one closes with. */
  readonly paperOpening: Money | null;
  readonly paperClosing: Money | null;
  /** What its sheets add up to; null without sheets or when one of them does not say. */
  readonly paperIncome: Money | null;
  readonly paperExpense: Money | null;
}

/** A figure added up over the month's sheets, unknown if any of them lacks it. */
function sheetsTotal(
  sheets: readonly PaperSheet[],
  figure: (sheet: PaperSheet) => Money | null,
): Money | null {
  const figures = sheets.map(figure);
  if (figures.length === 0 || figures.some((value) => value === null)) return null;
  return Money.sum(figures as Money[]);
}

/** Puts a month next to its sheets (any order; those of other months are ignored). */
export function reviewMonth(figures: MonthFigures, sheets: readonly PaperSheet[]): MonthReview {
  const monthSheets = sheets
    .filter((sheet) => sheet.month.equals(figures.month))
    .sort((a, b) => a.details.fromDay - b.details.fromDay);
  return {
    ...figures,
    sheets: monthSheets,
    paperOpening: monthSheets[0]?.details.figures.opening ?? null,
    paperClosing: monthSheets.at(-1)?.details.figures.closing ?? null,
    paperIncome: sheetsTotal(monthSheets, (sheet) => sheet.details.figures.income),
    paperExpense: sheetsTotal(monthSheets, (sheet) => sheet.details.figures.expense),
  };
}

/**
 * Whether the month's own rows explain its paper: what they add up to (income minus
 * expense) minus what the paper moved (closing minus opening). Zero when they agree; null
 * when the paper lacks either figure. It does not depend on earlier months.
 */
export function ownGap(review: MonthReview): Money | null {
  const { paperOpening, paperClosing } = review;
  if (!paperOpening || !paperClosing) return null;
  return review.income.minus(review.expense).minus(paperClosing.minus(paperOpening));
}

/**
 * What the month inherits: the balance carried into it minus what its paper opens with.
 * A missing month, or an error in an earlier one, shows up here in every month after it
 * until it is fixed. Null when the paper has no opening figure.
 */
export function carriedGap(review: MonthReview): Money | null {
  return review.paperOpening && review.opening.minus(review.paperOpening);
}

/**
 * Chains months from an opening balance, each opening with what the one before closed, the
 * way the books do: to add up an import file before it comes in.
 */
export function chainMonths(
  months: readonly YearMonth[],
  openingBalance: Money,
  totalsOf: (month: YearMonth) => { readonly income: Money; readonly expense: Money },
): MonthFigures[] {
  let opening = openingBalance;
  return months.map((month) => {
    const { income, expense } = totalsOf(month);
    const figures = {
      month,
      opening,
      income,
      expense,
      closing: opening.plus(income).minus(expense),
    };
    opening = figures.closing;
    return figures;
  });
}
