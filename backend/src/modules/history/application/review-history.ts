import { Inject, Injectable } from '@nestjs/common';
import {
  type Actor,
  type Money,
  NotFoundError,
  WriteAccessPolicy,
  type YearMonth,
} from '../../../shared-kernel/index.js';
import { GetMonthHistory, type MonthHistoryEntry } from '../../reports/application/index.js';
import {
  type MonthFigures,
  type MonthReview,
  PAPER_SHEET_REPOSITORY,
  type PaperSheetRepository,
  reviewMonth,
} from '../domain/index.js';

/** The history's months next to their paper: what the superadmin checks before closing them. */
export interface HistoryReview {
  readonly firstMonth: YearMonth;
  readonly lastMonth: YearMonth;
  /** The first month kept live, which opens with what the history closes with. */
  readonly cutover: YearMonth;
  readonly openingBalance: Money;
  /** What the last month closes with. */
  readonly closing: Money;
  readonly months: readonly {
    readonly review: MonthReview;
    /** Closing a month of the history is checking it against its paper. */
    readonly status: MonthHistoryEntry['status'];
  }[];
}

const figuresOf = (entry: MonthHistoryEntry): MonthFigures => ({
  month: entry.month,
  opening: entry.openingBalance,
  income: entry.income,
  expense: entry.expense,
  closing: entry.closingBalance,
});

/** The months of the history in order, as the books add them up; none without a history. */
async function historyMonths(months: GetMonthHistory, actor: Actor): Promise<MonthHistoryEntry[]> {
  const { months: entries } = await months.execute(actor);
  return entries.filter((entry) => entry.historical).reverse();
}

/** The whole history next to its paper, for the superadmin; null without one. */
@Injectable()
export class GetHistory {
  private readonly policy = new WriteAccessPolicy();

  constructor(
    @Inject(PAPER_SHEET_REPOSITORY) private readonly sheets: PaperSheetRepository,
    private readonly months: GetMonthHistory,
  ) {}

  async execute(actor: Actor): Promise<HistoryReview | null> {
    this.policy.assertCanAdminister(actor);
    const [entries, sheets] = await Promise.all([
      historyMonths(this.months, actor),
      this.sheets.findSheets(),
    ]);
    const first = entries[0];
    const last = entries.at(-1);
    if (!first || !last) return null;
    return {
      firstMonth: first.month,
      lastMonth: last.month,
      cutover: last.month.next(),
      openingBalance: first.openingBalance,
      closing: last.closingBalance,
      months: entries.map((entry) => ({
        review: reviewMonth(figuresOf(entry), sheets),
        status: entry.status,
      })),
    };
  }
}

/** One month of the history next to its sheets. Everyone may read it, like its report. */
@Injectable()
export class GetPaperMonth {
  constructor(
    @Inject(PAPER_SHEET_REPOSITORY) private readonly sheets: PaperSheetRepository,
    private readonly months: GetMonthHistory,
  ) {}

  async execute(
    actor: Actor,
    month: YearMonth,
  ): Promise<{ review: MonthReview; canEdit: boolean }> {
    const [entries, sheets] = await Promise.all([
      historyMonths(this.months, actor),
      this.sheets.findSheets(month),
    ]);
    const entry = entries.find((candidate) => candidate.month.equals(month));
    if (!entry) {
      throw new NotFoundError('MONTH_NOT_HISTORY', `${month} is not a month of the history`);
    }
    return {
      review: reviewMonth(figuresOf(entry), sheets),
      canEdit: actor.role === 'SUPERADMIN' && entry.status === 'OPEN',
    };
  }
}
