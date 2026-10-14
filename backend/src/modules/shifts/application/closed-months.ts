import { ConflictError, type MonthLedger, type YearMonth } from '../../../shared-kernel/index.js';

/**
 * A closed month freezes who answered for it: its delegations, and the skip penalties they
 * charge, cannot be added or cancelled until the superadmin reopens it.
 */
export async function assertNoneClosed(
  ledger: MonthLedger,
  months: readonly YearMonth[],
): Promise<void> {
  const statuses = await Promise.all(months.map((month) => ledger.statusOf(month)));
  const closed = months.filter((_, i) => statuses[i] === 'CLOSED');
  if (closed.length > 0) {
    throw new ConflictError(
      'DELEGATION_MONTH_CLOSED',
      `${closed.map(String).join(', ')} closed; reopen to change who answered for it`,
    );
  }
}
