import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  type Actor,
  ConflictError,
  Money,
  type MovementDetails,
  signedAmountOf,
  UNIT_OF_WORK,
  type UnitNumber,
  type UnitOfWork,
  validateMovement,
  ValidationError,
  WriteAccessPolicy,
  type YearMonth,
} from '../../../shared-kernel/index.js';
import { ImportMovements } from '../../cashbook/application/index.js';
import { GetReportingStart, StartBooksWithHistory } from '../../reports/application/index.js';
import { type EarlierRate, RecordEarlierRates } from '../../settings/application/index.js';
import { RenameUnitOwner } from '../../units/application/index.js';
import {
  assertNewSheetDay,
  chainMonths,
  PAPER_SHEET_REPOSITORY,
  PaperSheet,
  type PaperSheetRepository,
  reviewMonth,
  type SheetDetails,
} from '../domain/index.js';
import type { HistoryReview } from './review-history.js';

/** A sheet of the file, with the rows it lists. */
export type FileSheet = Omit<SheetDetails, 'month'> & {
  readonly movements: readonly MovementDetails[];
};

/** The import file (`historial.json`), once its JSON has been checked and parsed. */
export interface HistoryFile {
  /** Cash on hand when the first month began. */
  readonly openingBalance: Money;
  /** The months with paper; one missing between two comes in empty. */
  readonly months: readonly {
    readonly month: YearMonth;
    readonly sheets: readonly FileSheet[];
    /** Rows of a month without paper. */
    readonly movements: readonly MovementDetails[];
  }[];
  /** Owners' names as the current administration roster lists them. */
  readonly owners: readonly { readonly unit: UnitNumber; readonly name: string }[];
  /** The rates in force in the history. */
  readonly rates: readonly EarlierRate[];
}

export interface ImportPreview extends HistoryReview {
  readonly owners: HistoryFile['owners'];
  readonly movements: number;
}

interface History {
  readonly months: readonly YearMonth[];
  readonly cutover: YearMonth;
  /** Each sheet, and where its rows are in `rows`. */
  readonly sheets: readonly { readonly sheet: PaperSheet; readonly rows: readonly number[] }[];
  readonly rows: readonly MovementDetails[];
}

/**
 * Reads the file as a whole: its months, every sheet and row (the same rules as the books),
 * rows dated in their month, one sheet per starting day and each week's garbage paid once.
 * The history spans from its first month to its last, and the books go live after it.
 */
function historyOf(file: HistoryFile): History {
  const entries = [...file.months].sort((a, b) => a.month.compareTo(b.month));
  const first = entries[0];
  const last = entries.at(-1);
  if (!first || !last) throw new ValidationError('HISTORY_FILE_INVALID', 'The file has no months');
  entries.forEach((entry, i) => {
    if (i > 0 && entry.month.equals(entries[i - 1]!.month)) {
      throw new ValidationError('HISTORY_FILE_INVALID', `${entry.month} appears twice`);
    }
  });
  const sheets: History['sheets'][number][] = [];
  const rows: MovementDetails[] = [];
  const weeks = new Set<string>();
  /** Checks a row of `month` and adds it, returning where it is. */
  const add = (month: YearMonth, details: MovementDetails): number => {
    if (!details.date.yearMonth.equals(month)) {
      throw new ValidationError(
        'HISTORY_FILE_INVALID',
        `A row dated ${details.date} is listed under ${month}`,
      );
    }
    const row = validateMovement(details);
    if (row.week) {
      if (weeks.has(String(row.week))) {
        throw new ConflictError('GARBAGE_WEEK_PAID', `The week of ${row.week} is paid twice`);
      }
      weeks.add(String(row.week));
    }
    return rows.push(row) - 1;
  };
  for (const { month, sheets: monthSheets, movements } of entries) {
    for (const { movements: listed, ...details } of monthSheets) {
      const sheet = PaperSheet.create(randomUUID(), { ...details, month });
      assertNewSheetDay(
        sheet,
        sheets.map((entry) => entry.sheet),
      );
      sheets.push({ sheet, rows: listed.map((row) => add(month, row)) });
    }
    for (const details of movements) add(month, details);
  }
  return {
    months: first.month.through(last.month),
    cutover: last.month.next(),
    sheets,
    rows,
  };
}

/** The file added up the way the books will, month by month next to its paper. */
function reviewOf(file: HistoryFile, history: History): HistoryReview {
  const totals = new Map<string, { income: Money; expense: Money }>();
  for (const month of history.months) {
    const signed = history.rows
      .filter((row) => row.date.yearMonth.equals(month))
      .map(signedAmountOf);
    totals.set(String(month), {
      income: Money.sum(signed.filter((amount) => amount.isPositive())),
      expense: Money.sum(signed.filter((amount) => amount.isNegative())).negate(),
    });
  }
  const chained = chainMonths(history.months, file.openingBalance, (month) =>
    totals.get(String(month))!,
  );
  return {
    firstMonth: history.months[0]!,
    lastMonth: history.months.at(-1)!,
    cutover: history.cutover,
    openingBalance: file.openingBalance,
    closing: chained.at(-1)!.closing,
    months: chained.map((figures) => ({
      review: reviewMonth(
        figures,
        history.sheets.map((entry) => entry.sheet),
      ),
      status: 'OPEN',
    })),
  };
}

/** The books start with the history only while they have not started. */
async function assertBooksNotStarted(start: GetReportingStart): Promise<void> {
  if (await start.execute()) {
    throw new ConflictError(
      'BOOKS_ALREADY_STARTED',
      'The books have already started; the history comes in only before them',
    );
  }
}

/**
 * Checks an import file and adds it up without saving anything, so the superadmin sees what
 * would come in (months, balances against the paper) before confirming.
 */
@Injectable()
export class PreviewHistoryImport {
  private readonly policy = new WriteAccessPolicy();

  constructor(private readonly start: GetReportingStart) {}

  async execute(actor: Actor, file: HistoryFile): Promise<ImportPreview> {
    this.policy.assertCanAdminister(actor);
    const history = historyOf(file);
    await assertBooksNotStarted(this.start);
    return { ...reviewOf(file, history), owners: file.owners, movements: history.rows.length };
  }
}

/**
 * Starts the books with the building's history, all or nothing (ADR-0023): from its first
 * month and opening cash, every month of it open, its rows in the cashbook and its sheets
 * beside them. None of it goes to the audit log, which starts at the cut-over. The owners'
 * names are not history but the current roster, so they are set through the units module,
 * audited as any other change.
 */
@Injectable()
export class ImportHistory {
  private readonly policy = new WriteAccessPolicy();

  constructor(
    @Inject(PAPER_SHEET_REPOSITORY) private readonly sheets: PaperSheetRepository,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    private readonly start: GetReportingStart,
    private readonly startBooks: StartBooksWithHistory,
    private readonly earlierRates: RecordEarlierRates,
    private readonly movements: ImportMovements,
    private readonly renameOwner: RenameUnitOwner,
  ) {}

  async execute(actor: Actor, file: HistoryFile): Promise<void> {
    this.policy.assertCanAdminister(actor);
    const history = historyOf(file);
    await this.unitOfWork.run(async () => {
      await assertBooksNotStarted(this.start);
      await this.startBooks.execute(actor, {
        month: history.months[0]!,
        openingBalance: file.openingBalance,
        cutover: history.cutover,
      });
      if (file.rates.length > 0) await this.earlierRates.execute(actor, file.rates);
      const imported = await this.movements.execute(actor, history.rows);
      await this.sheets.saveSheets(
        history.sheets.map(({ sheet, rows }) =>
          PaperSheet.create(
            sheet.id,
            sheet.details,
            rows.map((index) => imported[index]!.id),
          ),
        ),
      );
      for (const { unit, name } of file.owners) {
        await this.renameOwner.execute(actor, unit, name);
      }
    });
  }
}
