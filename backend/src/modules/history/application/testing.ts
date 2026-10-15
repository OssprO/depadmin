// In-memory adapters and fixtures for the history use case specs. Excluded from the build.
import { FakeUnitOfWork, RecordingAuditTrail } from '../../../../test/support/audit-trail.js';
import {
  type LocalDate,
  type Money,
  type MovementDetails,
  UnitNumber,
  YearMonth,
} from '../../../shared-kernel/index.js';
import { GetReportingStart } from '../../reports/application/index.js';
import { InMemoryReportRepository } from '../../reports/application/testing.js';
import { RenameUnitOwner } from '../../units/application/index.js';
import { buildingWith } from '../../units/application/testing.js';
import {
  type HistoricalBooks,
  HistoricalMovement,
  type HistoryRepository,
  PaperSheet,
  type SheetDetails,
} from '../domain/index.js';
import {
  AddHistoricalMovement,
  AddPaperSheet,
  RemoveHistoricalMovement,
  RemovePaperSheet,
  ReviseHistoricalMovement,
  RevisePaperSheet,
} from './edit-history.js';
import { HistoryAccess } from './history-access.js';
import { PastHistoryBoundary } from './history-boundary.js';
import {
  DiscardHistory,
  type HistoryFile,
  ImportHistory,
  PreviewHistoryImport,
} from './import-history.js';
import { GetHistoricalMonth, GetHistory } from './review-history.js';

/** Stored copies, so a use case that forgets to save is caught. */
const copySheet = (sheet: PaperSheet) => PaperSheet.create(sheet.id, sheet.details);
const copyMovement = (movement: HistoricalMovement) =>
  HistoricalMovement.record(movement.id, movement.details);

export class InMemoryHistoryRepository implements HistoryRepository {
  private books: HistoricalBooks | null = null;
  private readonly sheets = new Map<string, PaperSheet>();
  private readonly movements = new Map<string, HistoricalMovement>();

  loadBooks(): Promise<HistoricalBooks | null> {
    return Promise.resolve(this.books);
  }

  saveBooks(books: HistoricalBooks): Promise<void> {
    this.books = books;
    return Promise.resolve();
  }

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

  findMovements(month?: YearMonth): Promise<HistoricalMovement[]> {
    return Promise.resolve(
      [...this.movements.values()]
        .filter((movement) => !month || movement.month.equals(month))
        .sort((a, b) => a.date.compareTo(b.date))
        .map(copyMovement),
    );
  }

  findMovement(id: string): Promise<HistoricalMovement | null> {
    const movement = this.movements.get(id);
    return Promise.resolve(movement ? copyMovement(movement) : null);
  }

  findGarbageFor(week: LocalDate): Promise<HistoricalMovement | null> {
    const movement = [...this.movements.values()].find((m) => m.details.week?.equals(week));
    return Promise.resolve(movement ? copyMovement(movement) : null);
  }

  saveMovements(movements: readonly HistoricalMovement[]): Promise<void> {
    for (const movement of movements) this.movements.set(movement.id, copyMovement(movement));
    return Promise.resolve();
  }

  removeMovement(id: string): Promise<void> {
    this.movements.delete(id);
    return Promise.resolve();
  }

  discard(): Promise<void> {
    this.books = null;
    this.sheets.clear();
    this.movements.clear();
    return Promise.resolve();
  }
}

/** Every history use case over in-memory storage. */
export function historyFixture() {
  const repository = new InMemoryHistoryRepository();
  const unitOfWork = new FakeUnitOfWork();
  const audit = new RecordingAuditTrail(unitOfWork);
  const units = buildingWith();
  const reports = new InMemoryReportRepository();
  const start = new GetReportingStart(reports);
  const access = new HistoryAccess(repository);
  return {
    repository,
    audit,
    units,
    /** Where the live books start, for a spec to set. */
    setStart: (month: string, openingBalance: Money) =>
      reports.saveStart({ month: YearMonth.parse(month), openingBalance }),
    boundary: new PastHistoryBoundary(repository),
    preview: new PreviewHistoryImport(start),
    import: new ImportHistory(
      repository,
      unitOfWork,
      start,
      new RenameUnitOwner(units, unitOfWork, audit),
    ),
    discard: new DiscardHistory(repository, unitOfWork, access),
    get: new GetHistory(repository, access, start),
    month: new GetHistoricalMonth(repository, access),
    addMovement: new AddHistoricalMovement(repository, unitOfWork, access),
    reviseMovement: new ReviseHistoricalMovement(repository, unitOfWork, access),
    removeMovement: new RemoveHistoricalMovement(repository, unitOfWork, access),
    addSheet: new AddPaperSheet(repository, unitOfWork, access),
    reviseSheet: new RevisePaperSheet(repository, unitOfWork, access),
    removeSheet: new RemovePaperSheet(repository, unitOfWork, access),
  };
}

type SheetData = Omit<SheetDetails, 'month'>;

/** A small history file: May–July 2022, built from the specs' rows and sheets. */
export function historyFile(
  months: Record<string, { sheets?: SheetData[]; movements?: MovementDetails[] }>,
  openingBalance: Money,
  owners: Record<number, string> = {},
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
  };
}
