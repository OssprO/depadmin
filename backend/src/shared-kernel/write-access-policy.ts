import type { Actor } from './actor.js';
import { ForbiddenError, ValidationError } from './domain-error.js';
import { LocalDate } from './local-date.js';
import type { UnitNumber } from './unit-number.js';
import type { YearMonth } from './year-month.js';

/** Calendar days after a shift ends during which the outgoing depto can still act on it. */
export const WRITE_GRACE_DAYS = 5;

/** A responsibility streak longer than this is treated as ending there (a safety bound). */
const MAX_STREAK_MONTHS = 120;

/**
 * Port: whether a depto answers for a month (it holds the shift or receives a delegation of
 * it). The shifts module answers it (`LoadShiftResponsibility`).
 */
export interface ShiftResponsibility {
  isResponsible(unit: UnitNumber, month: YearMonth): boolean;
}

/**
 * Port: who answers for the months from `month` on (holders and delegations). The shifts
 * module provides it globally, so a module below it (settings) can ask without importing
 * it. The result also answers the months that follow, to follow a write window.
 */
export interface ShiftRoster {
  responsibilityFor(month: YearMonth): Promise<ShiftResponsibility>;
}

export const SHIFT_ROSTER = Symbol('ShiftRoster');

/** Who is asking to decide for the building, and when. */
export interface GovernRequest {
  readonly actor: Actor;
  readonly today: LocalDate;
  /** Must answer for `today`'s month. */
  readonly responsibility: ShiftResponsibility;
}

export interface MonthAccessRequest {
  readonly actor: Actor;
  readonly month: YearMonth;
  readonly today: LocalDate;
  readonly responsibility: ShiftResponsibility;
}

export type AccessDenial = 'READ_ONLY' | 'NOT_RESPONSIBLE' | 'OUTSIDE_WRITE_WINDOW';

export type AccessDecision =
  { readonly allowed: true } | { readonly allowed: false; readonly reason: AccessDenial };

/** First and last day (both included) on which an owner can act on a month. */
export interface WriteWindow {
  readonly from: LocalDate;
  readonly to: LocalDate;
}

/**
 * Who can write, close and hand over a month:
 * - The superadmin, always, as an auxiliary for special cases (ADR-0031); reopening a
 *   closed month is theirs alone.
 * - A read-only user, never, whatever the shift.
 * - An owner whose depto is responsible for the month, from its first day until
 *   `WRITE_GRACE_DAYS` days after their responsibility ends. While 501 holds August and
 *   September it can still fix August in September; once the shift passes on 1 October it
 *   has until 5 October to square the books, close and hand over. From the 6th, only the
 *   superadmin. The next holder never gets access to earlier months.
 *
 * Whether the month is still open is a separate rule, enforced by the cashbook itself.
 */
export class WriteAccessPolicy {
  constructor(private readonly graceDays: number = WRITE_GRACE_DAYS) {
    if (!Number.isInteger(graceDays) || graceDays < 0) {
      throw new ValidationError('GRACE_DAYS_INVALID', `Invalid grace days ${graceDays}`);
    }
  }

  /** The owner's window for a month, or `null` if their depto is not responsible for it. */
  windowFor(
    unit: UnitNumber,
    month: YearMonth,
    responsibility: ShiftResponsibility,
  ): WriteWindow | null {
    if (!responsibility.isResponsible(unit, month)) return null;
    let lastMonth = month;
    for (let i = 0; i < MAX_STREAK_MONTHS; i++) {
      if (!responsibility.isResponsible(unit, lastMonth.next())) break;
      lastMonth = lastMonth.next();
    }
    return {
      from: LocalDate.firstOf(month),
      to: LocalDate.firstOf(lastMonth.next()).plusDays(this.graceDays - 1),
    };
  }

  decide(request: MonthAccessRequest): AccessDecision {
    const { actor, today } = request;
    if (actor.role === 'SUPERADMIN') return { allowed: true };
    if (actor.role === 'READER') return { allowed: false, reason: 'READ_ONLY' };

    const window = this.windowFor(actor.unit, request.month, request.responsibility);
    if (!window) return { allowed: false, reason: 'NOT_RESPONSIBLE' };
    if (today.isBefore(window.from) || today.isAfter(window.to)) {
      return { allowed: false, reason: 'OUTSIDE_WRITE_WINDOW' };
    }
    return { allowed: true };
  }

  /** Adding, revising or removing rows of the month. */
  assertCanWrite(request: MonthAccessRequest): void {
    this.assertAccess(request, 'write');
  }

  /** The outgoing administrator closes their own months; the superadmin can close any. */
  assertCanClose(request: MonthAccessRequest): void {
    this.assertAccess(request, 'close');
  }

  /**
   * Deciding who takes the shift that starts in `firstMonth` (the next depto, the outgoing
   * one again, or someone else). It belongs to whoever can still act on the month before.
   */
  assertCanHandOver(request: Omit<MonthAccessRequest, 'month'> & { firstMonth: YearMonth }): void {
    const { firstMonth, ...rest } = request;
    this.assertAccess({ ...rest, month: firstMonth.previous() }, 'hand over after');
  }

  /**
   * Whether the actor is the shift administrator: the owner of a depto that answers for the
   * current month, by its shift or a delegation (ADR-0031). The building's decisions
   * (rates, and the proposals that go to a vote) are theirs; the superadmin is an auxiliary
   * and does not take them.
   */
  governs({ actor, today, responsibility }: GovernRequest): boolean {
    return actor.role === 'OWNER' && responsibility.isResponsible(actor.unit, today.yearMonth);
  }

  assertGoverns(request: GovernRequest): void {
    if (request.actor.role === 'READER') {
      throw new ForbiddenError('READ_ONLY', `User ${request.actor.userId} can only read`);
    }
    if (!this.governs(request)) {
      throw new ForbiddenError(
        'SHIFT_ADMIN_ONLY',
        `User ${request.actor.userId} does not hold the shift of ${request.today.yearMonth}`,
      );
    }
  }

  /**
   * The auxiliary's tasks: reopening months, accounts, unit status, setting up the books.
   * Superadmin only.
   */
  assertCanAdminister(actor: Actor): void {
    if (actor.role !== 'SUPERADMIN') {
      throw new ForbiddenError('SUPERADMIN_ONLY', `User ${actor.userId} is not the superadmin`);
    }
  }

  private assertAccess(request: MonthAccessRequest, action: string): void {
    const decision = this.decide(request);
    if (!decision.allowed) {
      throw new ForbiddenError(
        decision.reason,
        `User ${request.actor.userId} cannot ${action} ${request.month} on ${request.today}`,
      );
    }
  }
}
