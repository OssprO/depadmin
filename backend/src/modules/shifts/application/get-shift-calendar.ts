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
import type { ShiftAssignment } from '../domain/index.js';
import { LoadShiftCalendar, type ShiftCalendar } from './shift-calendar.js';

/** The longest range one request may ask for. */
export const MAX_CALENDAR_MONTHS = 36;

export interface CalendarMonth extends ShiftAssignment {
  /** Whether the actor can delegate this month now (the outgoing owner's handover, or the superadmin). */
  readonly canDelegate: boolean;
}

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
    const closed = await this.closedMonths(from.through(to));
    return from.through(to).map((month) => {
      const assignment = calendar.assignmentFor(month);
      const canDelegate =
        !closed.has(String(month)) && this.canDelegate(actor, assignment, calendar);
      return { ...assignment, canDelegate };
    });
  }

  /**
   * The months `DelegateShift` would refuse because they are closed. Only a month that is
   * over can be closed, so the current month and the ones ahead are not asked about.
   */
  private async closedMonths(months: readonly YearMonth[]): Promise<Set<string>> {
    const thisMonth = this.clock.today().yearMonth;
    const past = months.filter((month) => month.isBefore(thisMonth));
    const statuses = await Promise.all(past.map((month) => this.ledger.statusOf(month)));
    return new Set(past.filter((_, i) => statuses[i] === 'CLOSED').map(String));
  }

  /**
   * The current month, the first month of the next period, and today's date. Neither month
   * is over, so neither can be closed.
   */
  async current(actor: Actor) {
    const today = this.clock.today();
    const month = today.yearMonth;
    const calendar = await this.calendars.execute(month);
    const current = calendar.assignmentFor(month);
    const next = calendar.assignmentFor(current.period.end.next());
    return {
      today,
      current: { ...current, canDelegate: this.canDelegate(actor, current, calendar) },
      next: { ...next, canDelegate: this.canDelegate(actor, next, calendar) },
      inactiveUnits: calendar.units.inactiveIn(month),
    };
  }

  /**
   * Mirrors the checks `DelegateShift` makes, so the screen offers the action only where it
   * would succeed: no active delegation yet, and for an owner, a handover of the period
   * that follows theirs while they can still act on it. `execute` also leaves out the
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
