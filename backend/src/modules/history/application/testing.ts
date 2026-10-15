// In-memory adapters and fixtures for the history use case specs. Excluded from the build.
import {
  type Money,
  type MovementDetails,
  UnitNumber,
  YearMonth,
} from '../../../shared-kernel/index.js';
import { GetReportingStart } from '../../reports/application/index.js';
import { booksFixture } from '../../reports/application/testing.js';
import type { EarlierRate } from '../../settings/application/index.js';
import { RenameUnitOwner } from '../../units/application/index.js';
import { PaperSheet, type PaperSheetRepository, type SheetDetails } from '../domain/index.js';
import { type HistoryFile, ImportHistory, PreviewHistoryImport } from './import-history.js';
import {
  AddPaperSheet,
  PaperSheetAccess,
  RemovePaperSheet,
  RevisePaperSheet,
  SheetPaperRecord,
} from './paper-sheets.js';
import { GetHistory, GetPaperMonth } from './review-history.js';

/** Stored copies, so a use case that forgets to save is caught. */
const copySheet = (sheet: PaperSheet) => PaperSheet.create(sheet.id, sheet.details);

export class InMemoryPaperSheetRepository implements PaperSheetRepository {
  private readonly sheets = new Map<string, PaperSheet>();

  findSheets(month?: YearMonth): Promise<PaperSheet[]> {
    return Promise.resolve(
      [...this.sheets.values()]
        .filter((sheet) => !month || sheet.month.equals(month))
        .sort((a, b) => a.month.compareTo(b.month) || a.details.fromDay - b.details.fromDay)
        .map(copySheet),
    );
  }

  findSheet(id: string): Promise<PaperSheet | null> {
    const sheet = this.sheets.get(id);
    return Promise.resolve(sheet ? copySheet(sheet) : null);
  }

  saveSheets(sheets: readonly PaperSheet[]): Promise<void> {
    for (const sheet of sheets) this.sheets.set(sheet.id, copySheet(sheet));
    return Promise.resolve();
  }

  removeSheet(id: string): Promise<void> {
    this.sheets.delete(id);
    return Promise.resolve();
  }
}

/** Every history use case over the whole books in memory, on the given day. */
export function historyFixture(today = '2026-10-02') {
  const books = booksFixture(today);
  const sheets = new InMemoryPaperSheetRepository();
  const { unitOfWork, audit, reports, ledger } = books;
  const start = new GetReportingStart(reports);
  const access = new PaperSheetAccess(ledger);
  return {
    ...books,
    sheets,
    paperRecord: new SheetPaperRecord(sheets),
    preview: new PreviewHistoryImport(start),
    import: new ImportHistory(
      sheets,
      unitOfWork,
      start,
      books.startWithHistory,
      books.earlierRates,
      books.importRows,
      new RenameUnitOwner(books.unitRepository, unitOfWork, audit),
    ),
    get: new GetHistory(sheets, books.history),
    month: new GetPaperMonth(sheets, books.history),
    addSheet: new AddPaperSheet(sheets, unitOfWork, access),
    reviseSheet: new RevisePaperSheet(sheets, unitOfWork, access),
    removeSheet: new RemovePaperSheet(sheets, unitOfWork, access),
  };
}

type SheetData = Omit<SheetDetails, 'month'>;

/** A history file built from the specs' rows and sheets. */
export function historyFile(
  months: Record<string, { sheets?: SheetData[]; movements?: MovementDetails[] }>,
  openingBalance: Money,
  { owners = {}, rates = [] }: { owners?: Record<number, string>; rates?: EarlierRate[] } = {},
): HistoryFile {
  return {
    openingBalance,
    months: Object.entries(months).map(([month, entry]) => ({
      month: YearMonth.parse(month),
      sheets: entry.sheets ?? [],
      movements: entry.movements ?? [],
    })),
    owners: Object.entries(owners).map(([unit, name]) => ({
      unit: UnitNumber.of(Number(unit)),
      name,
    })),
    rates,
  };
}
