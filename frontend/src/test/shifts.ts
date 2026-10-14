import type { CurrentShiftResponse, ShiftDelegation, ShiftMonth } from '@depadmin/shared';

// Calendar fixtures: 501 holds Aug–Sep 2026, 502 Oct–Nov, 401 Dec–Jan.

const PERIODS: Record<string, [string, string, ShiftMonth['scheduledUnit']]> = {
  '2026-08': ['2026-08', '2026-09', 501],
  '2026-09': ['2026-08', '2026-09', 501],
  '2026-10': ['2026-10', '2026-11', 502],
  '2026-11': ['2026-10', '2026-11', 502],
  '2026-12': ['2026-12', '2027-01', 401],
  '2027-01': ['2026-12', '2027-01', 401],
};

export function shiftMonth(month: string, overrides: Partial<ShiftMonth> = {}): ShiftMonth {
  const [start, end, scheduledUnit] = PERIODS[month]!;
  const delegation = overrides.delegation ?? null;
  return {
    month,
    period: { start, end },
    scheduledUnit,
    scheduledUnitActive: true,
    delegation,
    responsibleUnits: delegation ? [scheduledUnit, delegation.delegateUnit] : [scheduledUnit],
    canDelegate: false,
    ...overrides,
  };
}

export const skip502: ShiftDelegation = {
  id: '3f0c9a52-8b7e-4d1a-9c2b-5e6f7a8b9c0d',
  from: '2026-10',
  to: '2026-11',
  originalUnit: 502,
  delegateUnit: 501,
  reason: 'SKIPPED_SHIFT',
};

export function currentShift(overrides: Partial<CurrentShiftResponse> = {}): CurrentShiftResponse {
  return {
    today: '2026-10-02',
    current: shiftMonth('2026-10'),
    next: shiftMonth('2026-12'),
    inactiveUnits: [],
    ...overrides,
  };
}
