import { Money, type YearMonth } from '../../../shared-kernel/index.js';
import type { HistoricalBooks } from './historical-books.js';
import type { HistoricalMovement } from './historical-movement.js';
import type { PaperSheet } from './paper-sheet.js';

/** A past month as its rows add up, next to what its paper sheets say. */
export interface MonthReview {
  readonly month: YearMonth;
  /** Its sheets in order; none when the paper is missing. */
  readonly sheets: readonly PaperSheet[];
  readonly movements: readonly HistoricalMovement[];
  /** Carried from the month before (the history's opening cash for the first month). */
  readonly opening: Money;
  readonly income: Money;
  readonly expense: Money;
  readonly closing: Money;
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
 * Adds up every month of the history from its opening cash, the way the live books chain
 * their months, and puts each month next to its paper. Where the two disagree there is a
 * row missing, mistyped, or an error in the paper itself.
 */
export function reviewHistory(
  books: HistoricalBooks,
  sheets: readonly PaperSheet[],
  movements: readonly HistoricalMovement[],
): MonthReview[] {
  let opening = books.openingBalance;
  return books.months.map((month) => {
    const ofMonth = movements
      .filter((movement) => movement.month.equals(month))
      .sort((a, b) => a.date.compareTo(b.date));
    const monthSheets = sheets
      .filter((sheet) => sheet.month.equals(month))
      .sort((a, b) => a.details.fromDay - b.details.fromDay);
    const income = Money.sum(
      ofMonth.filter((m) => m.signedAmount.isPositive()).map((m) => m.signedAmount),
    );
    const expense = Money.sum(
      ofMonth.filter((m) => m.signedAmount.isNegative()).map((m) => m.signedAmount.negate()),
    );
    const review: MonthReview = {
      month,
      sheets: monthSheets,
      movements: ofMonth,
      opening,
      income,
      expense,
      closing: opening.plus(income).minus(expense),
      paperOpening: monthSheets[0]?.details.figures.opening ?? null,
      paperClosing: monthSheets.at(-1)?.details.figures.closing ?? null,
      paperIncome: sheetsTotal(monthSheets, (sheet) => sheet.details.figures.income),
      paperExpense: sheetsTotal(monthSheets, (sheet) => sheet.details.figures.expense),
    };
    opening = review.closing;
    return review;
  });
}
