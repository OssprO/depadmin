import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  type Actor,
  ConflictError,
  type Money,
  type MovementDetails,
  UNIT_OF_WORK,
  type UnitNumber,
  type UnitOfWork,
  ValidationError,
  WriteAccessPolicy,
  type YearMonth,
} from '../../../shared-kernel/index.js';
import { GetReportingStart } from '../../reports/application/index.js';
import { RenameUnitOwner } from '../../units/application/index.js';
import {
  assertNewSheetDay,
  assertWeekUnpaid,
  HistoricalBooks,
  HistoricalMovement,
  HISTORY_REPOSITORY,
  type HistoryRepository,
  PaperSheet,
  type SheetDetails,
} from '../domain/index.js';
import { HistoryAccess } from './history-access.js';
import { type HistoryReview, reviewOf } from './review-history.js';

/** The import file (`historial.json`), once its JSON has been checked and parsed. */
export interface HistoryFile {
  /** Cash on hand when the first month began. */
  readonly openingBalance: Money;
  readonly months: readonly {
    readonly month: YearMonth;
    readonly sheets: readonly Omit<SheetDetails, 'month'>[];
    readonly movements: readonly MovementDetails[];
  }[];
  /** Owners' names as the current administration roster lists them. */
  readonly owners: readonly { readonly unit: UnitNumber; readonly name: string }[];
}

export interface ImportPreview extends HistoryReview {
  readonly owners: HistoryFile['owners'];
}

interface History {
  readonly books: HistoricalBooks;
  readonly sheets: PaperSheet[];
  readonly movements: HistoricalMovement[];
}

/**
 * Turns the file into the history's objects, checking it as a whole: its months, every
 * sheet and row (same rules as the live books), rows dated in their month, one sheet per
 * starting day and each week's garbage paid once.
 */
function historyFrom(file: HistoryFile): History {
  const months = [...file.months].sort((a, b) => a.month.compareTo(b.month));
  if (months.length === 0) {
    throw new ValidationError('HISTORY_FILE_INVALID', 'The file has no months');
  }
  months.forEach((entry, i) => {
    if (i > 0 && entry.month.equals(months[i - 1]!.month)) {
      throw new ValidationError('HISTORY_FILE_INVALID', `${entry.month} appears twice`);
    }
  });
  const books = HistoricalBooks.start(months[0]!.month, months.at(-1)!.month, file.openingBalance);
  const sheets: PaperSheet[] = [];
  const movements: HistoricalMovement[] = [];
  const garbage: HistoricalMovement[] = [];
  for (const { month, sheets: monthSheets, movements: rows } of months) {
    for (const details of monthSheets) {
      const sheet = PaperSheet.create(randomUUID(), { ...details, month });
      assertNewSheetDay(sheet, sheets);
      sheets.push(sheet);
    }
    for (const details of rows) {
      if (!details.date.yearMonth.equals(month)) {
        throw new ValidationError(
          'HISTORY_FILE_INVALID',
          `A row dated ${details.date} is listed under ${month}`,
        );
      }
      const movement = HistoricalMovement.record(randomUUID(), details);
      assertWeekUnpaid(movement, garbage);
      if (details.week) garbage.push(movement);
      movements.push(movement);
    }
  }
  return { books, sheets, movements };
}

/**
 * Checks an import file and adds it up without saving anything, so the superadmin sees what
 * would come in (months, balances against the paper, the cut-over) before confirming.
 */
@Injectable()
export class PreviewHistoryImport {
  private readonly policy = new WriteAccessPolicy();

  constructor(private readonly start: GetReportingStart) {}

  async execute(actor: Actor, file: HistoryFile): Promise<ImportPreview> {
    this.policy.assertCanAdminister(actor);
    const { books, sheets, movements } = historyFrom(file);
    const start = await this.start.execute();
    if (start) books.assertEndsBefore(start.month);
    return { ...reviewOf(books, sheets, movements, start), owners: file.owners };
  }
}

/**
 * Brings the history in, all or nothing, under the superadmin. The months stay in review
 * and outside the audit log (ADR-0022). The owners' names are not history but the current
 * roster, so they are set through the units module, audited as any other change.
 */
@Injectable()
export class ImportHistory {
  private readonly policy = new WriteAccessPolicy();

  constructor(
    @Inject(HISTORY_REPOSITORY) private readonly history: HistoryRepository,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    private readonly start: GetReportingStart,
    private readonly renameOwner: RenameUnitOwner,
  ) {}

  async execute(actor: Actor, file: HistoryFile): Promise<HistoricalBooks> {
    this.policy.assertCanAdminister(actor);
    const { books, sheets, movements } = historyFrom(file);
    return this.unitOfWork.run(async () => {
      if (await this.history.loadBooks()) {
        throw new ConflictError(
          'HISTORY_ALREADY_IMPORTED',
          'A history is already in place; discard it before importing again',
        );
      }
      const start = await this.start.execute();
      if (start) books.assertEndsBefore(start.month);
      await this.history.saveBooks(books);
      await this.history.saveSheets(sheets);
      await this.history.saveMovements(movements);
      for (const { unit, name } of file.owners) {
        await this.renameOwner.execute(actor, unit, name);
      }
      return books;
    });
  }
}

/** Deletes the whole history while it is in review, to import a corrected file. */
@Injectable()
export class DiscardHistory {
  constructor(
    @Inject(HISTORY_REPOSITORY) private readonly history: HistoryRepository,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    private readonly access: HistoryAccess,
  ) {}

  execute(actor: Actor): Promise<void> {
    return this.unitOfWork.run(async () => {
      await this.access.forWriting(actor);
      await this.history.discard();
    });
  }
}
