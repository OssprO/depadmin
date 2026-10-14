// In-memory wiring for the shifts use case specs. Excluded from the build.
import { FakeUnitOfWork, RecordingAuditTrail } from '../../../../test/support/audit-trail.js';
import { FixedClock } from '../../../../test/support/clock.js';
import { FakeMonthLedger } from '../../../../test/support/month-ledger.js';
import {
  type Actor,
  UnitNumber,
  type YearMonth,
  YearMonthRange,
} from '../../../shared-kernel/index.js';
import {
  ChargeShiftSkipPenalties,
  WithdrawShiftSkipPenalties,
} from '../../billing/application/index.js';
import { InMemoryChargeRepository } from '../../billing/application/testing.js';
import { initialRates } from '../../settings/application/testing.js';
import { ListUnits } from '../../units/application/index.js';
import { buildingWith } from '../../units/application/testing.js';
import { ShiftDelegation, type ShiftDelegationRepository } from '../domain/index.js';
import { CancelDelegation } from './cancel-delegation.js';
import { DelegateShift } from './delegate-shift.js';
import { GetShiftCalendar } from './get-shift-calendar.js';
import { LoadShiftCalendar } from './shift-calendar.js';

export class InMemoryShiftDelegationRepository implements ShiftDelegationRepository {
  readonly rows = new Map<string, ShiftDelegation>();

  findById(id: string): Promise<ShiftDelegation | null> {
    const row = this.rows.get(id);
    return Promise.resolve(row ? copy(row) : null);
  }

  findOverlapping(from: YearMonth, to: YearMonth): Promise<ShiftDelegation[]> {
    const range = YearMonthRange.between(from, to);
    return Promise.resolve(
      [...this.rows.values()].filter((d) => d.months.overlaps(range)).map(copy),
    );
  }

  save(delegation: ShiftDelegation): Promise<void> {
    this.rows.set(delegation.id, copy(delegation));
    return Promise.resolve();
  }
}

const copy = (d: ShiftDelegation) =>
  ShiftDelegation.create({
    id: d.id,
    months: d.months,
    originalUnit: d.originalUnit,
    delegateUnit: d.delegateUnit,
    reason: d.reason,
    cancelled: !d.isActive,
  });

export const u = (n: number) => UnitNumber.of(n);
export const admin: Actor = { role: 'SUPERADMIN', userId: 'u-admin' };
export const owner = (unit: number): Actor => ({
  role: 'OWNER',
  userId: `u-${unit}`,
  unit: u(unit),
});

/** The shifts use cases wired to in-memory adapters, on the given day. */
export function shiftsFixture(today: string, inactive: Record<number, YearMonthRange> = {}) {
  const clock = FixedClock.on(today);
  const unitOfWork = new FakeUnitOfWork();
  const audit = new RecordingAuditTrail(unitOfWork);
  const delegations = new InMemoryShiftDelegationRepository();
  const charges = new InMemoryChargeRepository();
  const units = buildingWith(inactive);
  const rates = initialRates();
  const calendars = new LoadShiftCalendar(delegations, new ListUnits(units));
  const months = new FakeMonthLedger();
  return {
    clock,
    months,
    audit,
    delegations,
    charges,
    calendar: new GetShiftCalendar(calendars, clock),
    delegate: new DelegateShift(
      delegations,
      unitOfWork,
      audit,
      clock,
      months,
      calendars,
      new ChargeShiftSkipPenalties(charges, unitOfWork, audit, rates),
    ),
    cancel: new CancelDelegation(
      delegations,
      unitOfWork,
      audit,
      months,
      new WithdrawShiftSkipPenalties(charges, unitOfWork, audit),
    ),
  };
}
