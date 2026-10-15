import { Inject, Injectable } from '@nestjs/common';
import type { Actor, Money, YearMonth } from '../../../shared-kernel/index.js';
import { GetReportingStart } from '../../reports/application/index.js';
import {
  type HistoricalBooks,
  type HistoricalMovement,
  HISTORY_REPOSITORY,
  type HistoryRepository,
  type MonthReview,
  type PaperSheet,
  reviewHistory,
} from '../domain/index.js';
import { HistoryAccess } from './history-access.js';

/** Where the live books take over from the history. */
export interface Cutover {
  /** The first month of the live books. */
  readonly month: YearMonth;
  /** The cash on hand the superadmin captured for it. */
  readonly openingBalance: Money;
  /**
   * The captured cash minus what the history closes with; zero when they agree. Null when
   * months lie between the two, so there is nothing to compare.
   */
  readonly difference: Money | null;
}

export interface HistoryReview {
  readonly books: HistoricalBooks;
  readonly months: readonly MonthReview[];
  /** What the history's last month closes with. */
  readonly closing: Money;
  /** Null until the live books have a start. */
  readonly cutover: Cutover | null;
}

/** The whole history added up, and how it meets the live books. */
export function reviewOf(
  books: HistoricalBooks,
  sheets: readonly PaperSheet[],
  movements: readonly HistoricalMovement[],
  start: { readonly month: YearMonth; readonly openingBalance: Money } | null,
): HistoryReview {
  const months = reviewHistory(books, sheets, movements);
  const closing = months.at(-1)?.closing ?? books.openingBalance;
  const cutover = start && {
    month: start.month,
    openingBalance: start.openingBalance,
    difference: start.month.equals(books.lastMonth.next())
      ? start.openingBalance.minus(closing)
      : null,
  };
  return { books, months, closing, cutover };
}

@Injectable()
export class GetHistory {
  constructor(
    @Inject(HISTORY_REPOSITORY) private readonly history: HistoryRepository,
    private readonly access: HistoryAccess,
    private readonly start: GetReportingStart,
  ) {}

  /** Null while no history has been imported. */
  async execute(actor: Actor): Promise<HistoryReview | null> {
    const books = await this.access.find(actor);
    if (!books) return null;
    const [sheets, movements, start] = await Promise.all([
      this.history.findSheets(),
      this.history.findMovements(),
      this.start.execute(),
    ]);
    return reviewOf(books, sheets, movements, start);
  }
}

@Injectable()
export class GetHistoricalMonth {
  constructor(
    @Inject(HISTORY_REPOSITORY) private readonly history: HistoryRepository,
    private readonly access: HistoryAccess,
  ) {}

  /** The month with its sheets and rows, and the books' state (whether it can change). */
  async execute(
    actor: Actor,
    month: YearMonth,
  ): Promise<{ books: HistoricalBooks; month: MonthReview }> {
    const books = await this.access.forReading(actor);
    books.assertCovers(month);
    // Its opening balance carries every earlier month, so all of them are added up.
    const [sheets, movements] = await Promise.all([
      this.history.findSheets(),
      this.history.findMovements(),
    ]);
    const review = reviewHistory(books, sheets, movements).find((m) => m.month.equals(month));
    return { books, month: review! };
  }
}
