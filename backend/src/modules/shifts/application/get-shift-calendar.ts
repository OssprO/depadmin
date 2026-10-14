import { Inject, Injectable } from '@nestjs/common';
import {
  type Actor,
  CLOCK,
  type Clock,
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
  ) {}

  async execute(actor: Actor, from: YearMonth, to: YearMonth): Promise<CalendarMonth[]> {
    if (from.isAfter(to) || from.monthsUntil(to) >= MAX_CALENDAR_MONTHS) {
      throw new ValidationError(
        'CALENDAR_RANGE_INVALID',
        `Ask for 1 to ${MAX_CALENDAR_MONTHS} months, from ${from} to ${to}`,
      );
    }
    const calendar = await this.calendars.execute(from, to);
    return from.through(to).map((month) => {
      const assignment = calendar.assignmentFor(month);
      return { ...assignment, canDelegate: this.canDelegate(actor, assignment, calendar) };
    });
  }

  /** The current month, the first month of the next period, and today's date. */
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
   * that follows theirs while they can still act on it.
   */
  private canDelegate(actor: Actor, assignment: ShiftAssignment, calendar: ShiftCalendar): boolean {
    if (assignment.delegation) return false;
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
