import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  type Actor,
  type MovementDetails,
  NotFoundError,
  UNIT_OF_WORK,
  type UnitOfWork,
} from '../../../shared-kernel/index.js';
import {
  assertNewSheetDay,
  assertWeekUnpaid,
  type HistoricalBooks,
  HistoricalMovement,
  HISTORY_REPOSITORY,
  type HistoryRepository,
  PaperSheet,
  type SheetDetails,
} from '../domain/index.js';
import { HistoryAccess } from './history-access.js';

// Corrections while the superadmin checks the history against the paper: rows and sheets
// are added, fixed and removed. Removing deletes for good, and nothing is audited
// (ADR-0022); it is a transcription being proofread, not the books being kept.

@Injectable()
export class AddHistoricalMovement {
  constructor(
    @Inject(HISTORY_REPOSITORY) private readonly history: HistoryRepository,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    private readonly access: HistoryAccess,
  ) {}

  execute(actor: Actor, details: MovementDetails): Promise<HistoricalMovement> {
    return this.unitOfWork.run(async () => {
      const books = await this.access.forWriting(actor);
      const movement = HistoricalMovement.record(randomUUID(), details);
      await assertFits(books, movement, this.history);
      await this.history.saveMovements([movement]);
      return movement;
    });
  }
}

/** Replaces the row's fields; it can move to another month of the history. */
@Injectable()
export class ReviseHistoricalMovement {
  constructor(
    @Inject(HISTORY_REPOSITORY) private readonly history: HistoryRepository,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    private readonly access: HistoryAccess,
  ) {}

  execute(actor: Actor, id: string, details: MovementDetails): Promise<HistoricalMovement> {
    return this.unitOfWork.run(async () => {
      const books = await this.access.forWriting(actor);
      const movement = await findMovement(this.history, id);
      movement.revise(details);
      await assertFits(books, movement, this.history);
      await this.history.saveMovements([movement]);
      return movement;
    });
  }
}

@Injectable()
export class RemoveHistoricalMovement {
  constructor(
    @Inject(HISTORY_REPOSITORY) private readonly history: HistoryRepository,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    private readonly access: HistoryAccess,
  ) {}

  execute(actor: Actor, id: string): Promise<void> {
    return this.unitOfWork.run(async () => {
      await this.access.forWriting(actor);
      await findMovement(this.history, id);
      await this.history.removeMovement(id);
    });
  }
}

/** A sheet found later (a missing month, or the second page of one). */
@Injectable()
export class AddPaperSheet {
  constructor(
    @Inject(HISTORY_REPOSITORY) private readonly history: HistoryRepository,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    private readonly access: HistoryAccess,
  ) {}

  execute(actor: Actor, details: SheetDetails): Promise<PaperSheet> {
    return this.unitOfWork.run(async () => {
      const books = await this.access.forWriting(actor);
      books.assertCovers(details.month);
      const sheet = PaperSheet.create(randomUUID(), details);
      assertNewSheetDay(sheet, await this.history.findSheets(sheet.month));
      await this.history.saveSheets([sheet]);
      return sheet;
    });
  }
}

/** Corrects a sheet's figures, source, remarks or observations. */
@Injectable()
export class RevisePaperSheet {
  constructor(
    @Inject(HISTORY_REPOSITORY) private readonly history: HistoryRepository,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    private readonly access: HistoryAccess,
  ) {}

  execute(actor: Actor, id: string, details: Omit<SheetDetails, 'month'>): Promise<PaperSheet> {
    return this.unitOfWork.run(async () => {
      await this.access.forWriting(actor);
      const sheet = await findSheet(this.history, id);
      sheet.revise(details);
      assertNewSheetDay(sheet, await this.history.findSheets(sheet.month));
      await this.history.saveSheets([sheet]);
      return sheet;
    });
  }
}

/** Removes a sheet; the month's rows stay. */
@Injectable()
export class RemovePaperSheet {
  constructor(
    @Inject(HISTORY_REPOSITORY) private readonly history: HistoryRepository,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    private readonly access: HistoryAccess,
  ) {}

  execute(actor: Actor, id: string): Promise<void> {
    return this.unitOfWork.run(async () => {
      await this.access.forWriting(actor);
      await findSheet(this.history, id);
      await this.history.removeSheet(id);
    });
  }
}

/** A row belongs to one of the history's months, and pays its garbage week only once. */
async function assertFits(
  books: HistoricalBooks,
  movement: HistoricalMovement,
  history: HistoryRepository,
): Promise<void> {
  books.assertCovers(movement.month);
  const { week } = movement.details;
  if (week) {
    const other = await history.findGarbageFor(week);
    assertWeekUnpaid(movement, other ? [other] : []);
  }
}

async function findMovement(history: HistoryRepository, id: string): Promise<HistoricalMovement> {
  const movement = await history.findMovement(id);
  if (!movement) {
    throw new NotFoundError('MOVEMENT_NOT_FOUND', `There is no historical movement ${id}`);
  }
  return movement;
}

async function findSheet(history: HistoryRepository, id: string): Promise<PaperSheet> {
  const sheet = await history.findSheet(id);
  if (!sheet) throw new NotFoundError('SHEET_NOT_FOUND', `There is no sheet ${id}`);
  return sheet;
}
