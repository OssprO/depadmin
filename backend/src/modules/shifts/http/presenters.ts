import type {
  CurrentShiftResponse,
  ShiftDelegation as ShiftDelegationResponse,
  ShiftMonth,
  UnitNumberValue,
} from '@depadmin/shared';
import type { UnitNumber } from '../../../shared-kernel/index.js';
import type { CalendarMonth, GetShiftCalendar } from '../application/index.js';
import type { ShiftDelegation } from '../domain/index.js';

// Unit numbers are validated by the domain; the cast narrows them to the contract's literals.
const unit = (number: UnitNumber) => number.value as UnitNumberValue;

export function toDelegation(delegation: ShiftDelegation): ShiftDelegationResponse {
  const { from, to } = delegation.months;
  return {
    id: delegation.id,
    from: String(from),
    to: String(to ?? from),
    originalUnit: unit(delegation.originalUnit),
    delegateUnit: unit(delegation.delegateUnit),
    reason: delegation.reason,
  };
}

export function toShiftMonth(month: CalendarMonth): ShiftMonth {
  return {
    month: String(month.month),
    period: { start: String(month.period.start), end: String(month.period.end) },
    scheduledUnit: unit(month.scheduledUnit),
    scheduledUnitActive: month.scheduledUnitActive,
    delegation: month.delegation && toDelegation(month.delegation),
    responsibleUnits: month.responsibleUnits.map(unit),
    canDelegate: month.canDelegate,
  };
}

export function toCurrentShift(
  current: Awaited<ReturnType<GetShiftCalendar['current']>>,
): CurrentShiftResponse {
  return {
    today: String(current.today),
    current: toShiftMonth(current.current),
    next: toShiftMonth(current.next),
    inactiveUnits: current.inactiveUnits.map(unit),
  };
}
