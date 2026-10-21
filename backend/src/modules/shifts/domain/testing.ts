import { UnitNumber, YearMonth, YearMonthRange } from '../../../shared-kernel/index.js';
import { type DelegationReason, ShiftDelegation } from './shift-delegation.js';
import type { UnitAvailability } from './shift-scheduler.js';

// Test builders shared by the shifts specs.

export const m = (text: string) => YearMonth.parse(text);
export const u = (n: number) => UnitNumber.of(n);

/** Every depto active, except the given ones during the given ranges. */
export function availability(inactive: Record<number, YearMonthRange> = {}): UnitAvailability {
  return {
    isActive: (unit, month) => !(inactive[unit.value]?.contains(month) ?? false),
  };
}

export function delegation(
  months: string,
  original: number,
  delegate: number,
  reason: DelegationReason = 'SKIPPED_SHIFT',
  id = `${original}->${delegate}@${months}`,
): ShiftDelegation {
  const [from = '', to = from] = months.split('..');
  return ShiftDelegation.create({
    id,
    months: YearMonthRange.between(m(from), m(to)),
    originalUnit: u(original),
    delegateUnit: u(delegate),
    reason,
  });
}
