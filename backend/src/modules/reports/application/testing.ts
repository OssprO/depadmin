// The whole bookkeeping flow wired to in-memory adapters, for the reports use case specs.
// Excluded from the build.
import { FakeUnitOfWork, RecordingAuditTrail } from '../../../../test/support/audit-trail.js';
import { FixedClock } from '../../../../test/support/clock.js';
import type { YearMonthRange } from '../../../shared-kernel/index.js';
import { ChargeMaintenanceFees, GetAccountStatements } from '../../billing/application/index.js';
import { InMemoryChargeRepository } from '../../billing/application/testing.js';
import { AddMovement, CashbookAccess, ReadCashbook } from '../../cashbook/application/index.js';
import { InMemoryCashMovementRepository } from '../../cashbook/application/testing.js';
import { initialRates } from '../../settings/application/testing.js';
import { LoadShiftCalendar } from '../../shifts/application/index.js';
import { InMemoryShiftDelegationRepository } from '../../shifts/application/testing.js';
import { ListUnits } from '../../units/application/index.js';
import { buildingWith } from '../../units/application/testing.js';
import {
  MonthlyReport,
  type ReportingStart,
  ReportLedger,
  type ReportRepository,
} from '../domain/index.js';
import { GetAccounts } from './accounts.js';
import { CloseMonth } from './close-month.js';
import { GetMonthlyReport } from './get-monthly-report.js';
import { GetMonthHistory } from './month-history.js';
import { MonthOpening, OpenCurrentMonth, OpenMonth } from './open-month.js';
import { ReopenMonth } from './reopen-month.js';
import { ReportMonthLedger } from './report-month-ledger.js';
import { GetReportingStart, SetReportingStart } from './reporting-start.js';

export class InMemoryReportRepository implements ReportRepository {
  private start: ReportingStart | null = null;
  private readonly reports = new Map<string, MonthlyReport>();

  loadLedger(): Promise<ReportLedger | null> {
    if (!this.start) return Promise.resolve(null);
    const copies = [...this.reports.values()].map((r) =>
      MonthlyReport.restore(r.month, r.snapshot),
    );
    return Promise.resolve(ReportLedger.restore(this.start, copies));
  }

  saveStart(start: ReportingStart): Promise<void> {
    this.start = start;
    return Promise.resolve();
  }

  save(reports: readonly MonthlyReport[]): Promise<void> {
    for (const report of reports) {
      this.reports.set(String(report.month), MonthlyReport.restore(report.month, report.snapshot));
    }
    return Promise.resolve();
  }
}

/** Every use case of the books, on the given day, over in-memory storage. */
export function booksFixture(today: string, inactive: Record<number, YearMonthRange> = {}) {
  const clock = FixedClock.on(today);
  const unitOfWork = new FakeUnitOfWork();
  const audit = new RecordingAuditTrail(unitOfWork);
  const reports = new InMemoryReportRepository();
  const ledger = new ReportMonthLedger(reports);
  const movements = new InMemoryCashMovementRepository();
  const charges = new InMemoryChargeRepository();
  const units = new ListUnits(buildingWith(inactive));
  const rates = initialRates();
  const calendars = new LoadShiftCalendar(new InMemoryShiftDelegationRepository(), units);
  const cashbook = new ReadCashbook(movements, ledger);
  const accounts = new GetAccounts(new GetAccountStatements(charges), cashbook);
  const opening = new MonthOpening(
    reports,
    unitOfWork,
    audit,
    new ChargeMaintenanceFees(charges, unitOfWork, audit, rates, units),
  );
  return {
    clock,
    audit,
    charges,
    accounts,
    setStart: new SetReportingStart(reports, unitOfWork, audit),
    getStart: new GetReportingStart(reports),
    open: new OpenMonth(clock, calendars, opening),
    openCurrent: new OpenCurrentMonth(reports, clock, opening),
    close: new CloseMonth(reports, unitOfWork, audit, clock, calendars, cashbook),
    reopen: new ReopenMonth(reports, unitOfWork, audit),
    history: new GetMonthHistory(reports, clock, cashbook, calendars),
    add: new AddMovement(
      movements,
      unitOfWork,
      audit,
      new CashbookAccess(movements, ledger, clock, calendars),
    ),
    view: new GetMonthlyReport(reports, clock, cashbook, accounts, calendars, rates),
  };
}
