import { Inject, Injectable } from '@nestjs/common';
import {
  type Actor,
  CLOCK,
  type Clock,
  MONTH_LEDGER,
  type MonthLedger,
  ValidationError,
  WriteAccessPolicy,
  type YearMonth,
} from '../../../shared-kernel/index.js';
import type { ShiftAssignment, ShiftDelegation } from '../domain/index.js';
import { LoadShiftCalendar, type ShiftCalendar } from './shift-calendar.js';

/** The longest range one request may ask for. */
export const MAX_CALENDAR_MONTHS = 36;

export interface CalendarMonth extends ShiftAssignment {
  /** Whether the actor can delegate this month now (the outgoing owner's handover, or the superadmin). */
  readonly canDelegate: boolean;
  /** Whether the actor can cancel the month's delegation now (the superadmin, if none of its months is closed). */
  readonly canCancel: boolean;
}

const monthsOf = ({ months }: ShiftDelegation) => months.from.through(months.to ?? months.from);

/** Who answers for each month of a range. Everyone may read it. */
@Injectable()
export class GetShiftCalendar {
  private readonly policy = new WriteAccessPolicy();

  constructor(
    private readonly calendars: LoadShiftCalendar,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(MONTH_LEDGER) private readonly ledger: MonthLedger,
  ) {}

  async execute(actor: Actor, from: YearMonth, to: YearMonth): Promise<CalendarMonth[]> {
    if (from.isAfter(to) || from.monthsUntil(to) >= MAX_CALENDAR_MONTHS) {
      throw new ValidationError(
        'CALENDAR_RANGE_INVALID',
        `Ask for 1 to ${MAX_CALENDAR_MONTHS} months, from ${from} to ${to}`,
      );
    }
    const calendar = await this.calendars.execute(from, to);
    return this.withActions(
      actor,
      from.through(to).map((month) => calendar.assignmentFor(month)),
      calendar,
    );
  }

  /** The current month, the first month of the next period, and today's date. */
  async current(actor: Actor) {
    const today = this.clock.today();
    const month = today.yearMonth;
    const calendar = await this.calendars.execute(month);
    const assignment = calendar.assignmentFor(month);
    const [current, next] = await this.withActions(
      actor,
      [assignment, calendar.assignmentFor(assignment.period.end.next())],
      calendar,
    );
    return {
      today,
      current: current!,
      next: next!,
      inactiveUnits: calendar.units.inactiveIn(month),
    };
  }

  /** What the actor can do on each month now. */
  private async withActions(
    actor: Actor,
    assignments: readonly ShiftAssignment[],
    calendar: ShiftCalendar,
  ): Promise<CalendarMonth[]> {
    const closed = await this.closedMonths(assignments);
    return assignments.map((assignment) => {
      const { month, delegation } = assignment;
      const canDelegate =
        !closed.has(String(month)) && this.canDelegate(actor, assignment, calendar);
      // Mirrors CancelDelegation: the superadmin's, while none of its months is closed.
      const canCancel =
        actor.role === 'SUPERADMIN' &&
        delegation !== null &&
        !monthsOf(delegation).some((covered) => closed.has(String(covered)));
      return { ...assignment, canDelegate, canCancel };
    });
  }

  /**
   * The closed months among the assignments and the months their delegations cover, which
   * `DelegateShift` and `CancelDelegation` refuse. Only a month that is over can be closed,
   * so the current month and the ones ahead are not asked about.
   */
  private async closedMonths(assignments: readonly ShiftAssignment[]): Promise<Set<string>> {
    const thisMonth = this.clock.today().yearMonth;
    const past = new Map<string, YearMonth>();
    for (const { month, delegation } of assignments) {
      for (const candidate of [month, ...(delegation ? monthsOf(delegation) : [])]) {
        if (candidate.isBefore(thisMonth)) past.set(String(candidate), candidate);
      }
    }
    const months = [...past.values()];
    const statuses = await Promise.all(months.map((month) => this.ledger.statusOf(month)));
    return new Set(months.filter((_, i) => statuses[i] === 'CLOSED').map(String));
  }

  /**
   * Mirrors the checks `DelegateShift` makes, so the screen offers the action only where it
   * would succeed: no active delegation yet, and for an owner, a handover of the period
   * that follows theirs while they can still act on it. `withActions` also leaves out the
   * closed months.
   */
  private canDelegate(actor: Actor, assignment: ShiftAssignment, calendar: ShiftCalendar): boolean {
    if (assignment.delegation || assignment.beforeRotation) return false;
    if (actor.role === 'SUPERADMIN') return true;
    const { month, period, scheduledUnitActive } = assignment;
    if (!month.equals(period.start) || !scheduledUnitActive) return false;
    return this.policy.decide({
      actor,
      month: month.previous(),
      today: this.clock.today(),
      responsibility: calendar,
    }).allowed;
  }
}
