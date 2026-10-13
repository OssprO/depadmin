import {
  ForbiddenError,
  LocalDate,
  type UnitNumber,
  ValidationError,
  type YearMonth,
} from '../../../shared-kernel/index.js';
import type { Actor } from './actor.js';

/** Calendar days of the next month during which a month can still be written by its owners. */
export const WRITE_GRACE_DAYS = 5;

export interface WriteRequest {
  readonly actor: Actor;
  /** The month whose cashbook is being written. */
  readonly month: YearMonth;
  /** Deptos responsible for that month (`ShiftAssignment.responsibleUnits`). */
  readonly responsibleUnits: readonly UnitNumber[];
  readonly today: LocalDate;
}

export type WriteDenial = 'NOT_RESPONSIBLE' | 'OUTSIDE_WRITE_WINDOW';

export type WriteDecision =
  { readonly allowed: true } | { readonly allowed: false; readonly reason: WriteDenial };

/** First and last day (both included) on which owners can write a month. */
export interface WriteWindow {
  readonly from: LocalDate;
  readonly to: LocalDate;
}

/**
 * Who can write a month's cashbook:
 * - The superadmin, always.
 * - An owner, only if their depto is responsible for that month (it holds the shift or
 *   receives a delegation of it) and only from the first day of the month through the
 *   `WRITE_GRACE_DAYS`-th day of the next one. For example, depto 501 writes September
 *   until 5 October; from 6 October only the superadmin can. The depto holding the shift
 *   today has no access to earlier months.
 *
 * Whether the month is still open is a separate rule, enforced by the cashbook itself.
 */
export class WriteAccessPolicy {
  constructor(private readonly graceDays: number = WRITE_GRACE_DAYS) {
    if (!Number.isInteger(graceDays) || graceDays < 0) {
      throw new ValidationError('GRACE_DAYS_INVALID', `Invalid grace days ${graceDays}`);
    }
  }

  windowFor(month: YearMonth): WriteWindow {
    return {
      from: LocalDate.firstOf(month),
      to: LocalDate.firstOf(month.next()).plusDays(this.graceDays - 1),
    };
  }

  decide(request: WriteRequest): WriteDecision {
    const { actor } = request;
    if (actor.role === 'SUPERADMIN') return { allowed: true };

    if (!request.responsibleUnits.includes(actor.unit)) {
      return { allowed: false, reason: 'NOT_RESPONSIBLE' };
    }
    const window = this.windowFor(request.month);
    if (request.today.isBefore(window.from) || request.today.isAfter(window.to)) {
      return { allowed: false, reason: 'OUTSIDE_WRITE_WINDOW' };
    }
    return { allowed: true };
  }

  assertCanWrite(request: WriteRequest): void {
    const decision = this.decide(request);
    if (!decision.allowed) {
      throw new ForbiddenError(
        decision.reason,
        `User ${request.actor.userId} cannot write ${request.month} on ${request.today}`,
      );
    }
  }

  /** Opening, closing and reopening months, settings and delegations: superadmin only. */
  assertCanAdminister(actor: Actor): void {
    if (actor.role !== 'SUPERADMIN') {
      throw new ForbiddenError('SUPERADMIN_ONLY', `User ${actor.userId} is not the superadmin`);
    }
  }
}
