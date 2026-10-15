import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  type Actor,
  ConflictError,
  MONTH_LEDGER,
  type MonthLedger,
  NotFoundError,
  type PaperPage,
  type PaperRecord,
  UNIT_OF_WORK,
  type UnitOfWork,
  WriteAccessPolicy,
  type YearMonth,
} from '../../../shared-kernel/index.js';
import {
  assertNewSheetDay,
  PAPER_SHEET_REPOSITORY,
  PaperSheet,
  type PaperSheetRepository,
  type SheetDetails,
} from '../domain/index.js';

// Correcting the paper sheets while the superadmin checks each month against them: a sheet
// found later, a figure misread, a line per depto. Only months of the history that are open,
// like its rows; and like them, nothing is audited (ADR-0023).

/** The checks a sheet's change starts with, inside its unit of work. */
@Injectable()
export class PaperSheetAccess {
  private readonly policy = new WriteAccessPolicy();

  constructor(@Inject(MONTH_LEDGER) private readonly ledger: MonthLedger) {}

  async forWriting(actor: Actor, month: YearMonth): Promise<void> {
    this.policy.assertCanAdminister(actor);
    await this.ledger.holdOpen(month);
    const cutover = await this.ledger.cutover();
    if (!cutover || !month.isBefore(cutover)) {
      throw new ConflictError('MONTH_NOT_HISTORY', `${month} is not a month of the history`);
    }
    const status = await this.ledger.statusOf(month);
    if (status === 'NOT_OPENED') {
      throw new ConflictError('MONTH_NOT_OPENED', `${month} is not open`);
    }
    if (status === 'CLOSED') {
      throw new ConflictError('MONTH_CLOSED', `${month} is closed; reopen it to correct it`);
    }
  }
}

/** A sheet found later (a missing month, or the second page of one). */
@Injectable()
export class AddPaperSheet {
  constructor(
    @Inject(PAPER_SHEET_REPOSITORY) private readonly sheets: PaperSheetRepository,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    private readonly access: PaperSheetAccess,
  ) {}

  execute(actor: Actor, details: SheetDetails): Promise<PaperSheet> {
    return this.unitOfWork.run(async () => {
      await this.access.forWriting(actor, details.month);
      const sheet = PaperSheet.create(randomUUID(), details);
      assertNewSheetDay(sheet, await this.sheets.findSheets(sheet.month));
      await this.sheets.saveSheets([sheet]);
      return sheet;
    });
  }
}

/** Corrects a sheet's figures, source, remarks or lines. */
@Injectable()
export class RevisePaperSheet {
  constructor(
    @Inject(PAPER_SHEET_REPOSITORY) private readonly sheets: PaperSheetRepository,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    private readonly access: PaperSheetAccess,
  ) {}

  execute(actor: Actor, id: string, details: Omit<SheetDetails, 'month'>): Promise<PaperSheet> {
    return this.unitOfWork.run(async () => {
      const sheet = await findSheet(this.sheets, id);
      await this.access.forWriting(actor, sheet.month);
      sheet.revise(details);
      assertNewSheetDay(sheet, await this.sheets.findSheets(sheet.month));
      await this.sheets.saveSheets([sheet]);
      return sheet;
    });
  }
}

/** Removes a sheet; the month's rows stay. */
@Injectable()
export class RemovePaperSheet {
  constructor(
    @Inject(PAPER_SHEET_REPOSITORY) private readonly sheets: PaperSheetRepository,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    private readonly access: PaperSheetAccess,
  ) {}

  execute(actor: Actor, id: string): Promise<void> {
    return this.unitOfWork.run(async () => {
      const sheet = await findSheet(this.sheets, id);
      await this.access.forWriting(actor, sheet.month);
      await this.sheets.removeSheet(id);
    });
  }
}

/** Answers the shared `PaperRecord` port, so a month's report reads like its sheets. */
@Injectable()
export class SheetPaperRecord implements PaperRecord {
  constructor(@Inject(PAPER_SHEET_REPOSITORY) private readonly sheets: PaperSheetRepository) {}

  async pagesOf(month: YearMonth): Promise<PaperPage[]> {
    return (await this.sheets.findSheets(month)).map((sheet) => ({
      fromDay: sheet.details.fromDay,
      responsible: sheet.details.responsible,
      lines: sheet.details.lines,
      movementIds: sheet.movementIds,
    }));
  }
}

async function findSheet(sheets: PaperSheetRepository, id: string): Promise<PaperSheet> {
  const sheet = await sheets.findSheet(id);
  if (!sheet) throw new NotFoundError('SHEET_NOT_FOUND', `There is no sheet ${id}`);
  return sheet;
}
