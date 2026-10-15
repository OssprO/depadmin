import type { YearMonth } from '../../../shared-kernel/index.js';
import type { ReadCashbook } from '../../cashbook/application/index.js';
import type { LiveTotals, MonthTotals, ReportLedger } from '../domain/index.js';

/**
 * The live totals the ledger needs for its balances: those of the open months up to
 * `through` (every month by default). Closed months answer with their snapshot, so their
 * rows are not read.
 */
export async function liveTotalsOf(
  cashbook: ReadCashbook,
  ledger: ReportLedger,
  through?: YearMonth,
): Promise<LiveTotals> {
  const months = ledger.reports
    .filter((report) => report.isOpen && (!through || !report.month.isAfter(through)))
    .map((report) => report.month);
  const totals: Map<string, MonthTotals> = await cashbook.totalsOf(months);
  return (month) => {
    const found = totals.get(String(month));
    if (!found) throw new Error(`The live totals of ${month} were not loaded`);
    return found;
  };
}
