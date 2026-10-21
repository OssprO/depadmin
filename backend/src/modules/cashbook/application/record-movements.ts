import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  type Actor,
  AUDIT_TRAIL,
  type AuditTrail,
  ConflictError,
  creationOf,
  type LocalDate,
  type Money,
  type MovementDetails,
  NotFoundError,
  removalOf,
  trackChanges,
  UNIT_OF_WORK,
  type UnitOfWork,
  WriteAccessPolicy,
} from '../../../shared-kernel/index.js';
import {
  assertNewVisits,
  assertWeekUnpaid,
  CASH_MOVEMENT_REPOSITORY,
  type CashMovement,
  type CashMovementRepository,
} from '../domain/index.js';
import { CashbookAccess } from './cashbook-access.js';
import { MOVEMENT_AUDIT, MovementAuditAction } from './movement-audit.js';

// Adding, revising and removing rows: one set of use cases for every category. What each
// category requires is the domain's `CATEGORY_RULES` (a strategy per category).

@Injectable()
export class AddMovement {
  constructor(
    @Inject(CASH_MOVEMENT_REPOSITORY) private readonly movements: CashMovementRepository,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(AUDIT_TRAIL) private readonly audit: AuditTrail,
    private readonly access: CashbookAccess,
  ) {}

  execute(actor: Actor, details: MovementDetails): Promise<CashMovement> {
    return this.unitOfWork.run(async () => {
      const cashbook = await this.access.forWriting(actor, details.date.yearMonth);
      const movement = cashbook.add(randomUUID(), details);
      await this.access.assertConsistent(movement);
      await this.movements.save([movement]);
      if (!(await this.access.isHistory(movement.month))) {
        await this.audit.record(
          actor,
          creationOf(MOVEMENT_AUDIT, MovementAuditAction.ADDED, movement),
        );
      }
      return movement;
    });
  }
}

/** Changes a row within its month. Moving it to another month is a removal plus an addition. */
@Injectable()
export class ReviseMovement {
  constructor(
    @Inject(CASH_MOVEMENT_REPOSITORY) private readonly movements: CashMovementRepository,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(AUDIT_TRAIL) private readonly audit: AuditTrail,
    private readonly access: CashbookAccess,
  ) {}

  execute(actor: Actor, id: string, changes: Partial<MovementDetails>): Promise<CashMovement> {
    return this.unitOfWork.run(async () => {
      const stored = await findMovement(this.movements, id);
      const cashbook = await this.access.forWriting(actor, stored.month);
      const tracked = trackChanges(MOVEMENT_AUDIT, stored);
      const movement = cashbook.revise(id, changes);
      await this.access.assertConsistent(movement);
      await this.movements.save([movement]);
      if (!(await this.access.isHistory(movement.month))) {
        await this.audit.record(actor, tracked.change(MovementAuditAction.REVISED, movement));
      }
      return movement;
    });
  }
}

/**
 * A soft delete: the row leaves the list and the totals. The log records every field it had,
 * so the entry reads as what was removed rather than as a flag that flipped.
 */
@Injectable()
export class RemoveMovement {
  constructor(
    @Inject(CASH_MOVEMENT_REPOSITORY) private readonly movements: CashMovementRepository,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(AUDIT_TRAIL) private readonly audit: AuditTrail,
    private readonly access: CashbookAccess,
  ) {}

  execute(actor: Actor, id: string): Promise<CashMovement> {
    return this.unitOfWork.run(async () => {
      const stored = await findMovement(this.movements, id);
      const cashbook = await this.access.forWriting(actor, stored.month);
      const movement = cashbook.remove(id);
      await this.movements.save([movement]);
      if (!(await this.access.isHistory(stored.month))) {
        await this.audit.record(
          actor,
          removalOf(MOVEMENT_AUDIT, MovementAuditAction.REMOVED, stored),
        );
      }
      return movement;
    });
  }
}

/**
 * The cleaning shortcut: several visits marked on a calendar become one row per visit, all
 * or none. Visits on dates that already have one are refused rather than doubled.
 */
@Injectable()
export class RecordCleaningVisits {
  constructor(
    @Inject(CASH_MOVEMENT_REPOSITORY) private readonly movements: CashMovementRepository,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(AUDIT_TRAIL) private readonly audit: AuditTrail,
    private readonly access: CashbookAccess,
  ) {}

  execute(
    actor: Actor,
    visits: { readonly dates: readonly LocalDate[]; readonly amount: Money },
  ): Promise<CashMovement[]> {
    return this.unitOfWork.run(async () => {
      const recorded: CashMovement[] = [];
      // A week can cross two months; each month's rows go through that month's checks.
      for (const dates of groupByMonth(visits.dates)) {
        const cashbook = await this.access.forWriting(actor, dates[0]!.yearMonth);
        assertNewVisits(dates, cashbook.movements);
        for (const date of dates) {
          recorded.push(
            cashbook.add(randomUUID(), {
              date,
              category: 'CLEANING',
              amount: visits.amount,
              description: null,
              unit: null,
              week: null,
            }),
          );
        }
      }
      await this.movements.save(recorded);
      for (const movement of recorded) {
        if (await this.access.isHistory(movement.month)) continue;
        await this.audit.record(
          actor,
          creationOf(MOVEMENT_AUDIT, MovementAuditAction.ADDED, movement),
        );
      }
      return recorded;
    });
  }
}

/**
 * The history's rows in bulk, from the import (ADR-0023): every row in a month of the
 * history that is open, all or none, checked by the same rules as one added by hand (each
 * week's garbage paid once included), and outside the audit log like any row of the
 * history. Same-day rows keep the order they come in, and the rows come back in it too.
 */
@Injectable()
export class ImportMovements {
  private readonly policy = new WriteAccessPolicy();

  constructor(
    @Inject(CASH_MOVEMENT_REPOSITORY) private readonly movements: CashMovementRepository,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    private readonly access: CashbookAccess,
  ) {}

  async execute(actor: Actor, rows: readonly MovementDetails[]): Promise<CashMovement[]> {
    this.policy.assertCanAdminister(actor);
    return this.unitOfWork.run(async () => {
      const imported: CashMovement[] = [];
      for (const dates of groupByMonth(rows.map((row) => row.date))) {
        const month = dates[0]!.yearMonth;
        if (!(await this.access.isHistory(month))) {
          throw new ConflictError(
            'MONTH_NOT_HISTORY',
            `${month} is not a month of the history; record its rows one by one`,
          );
        }
        const cashbook = await this.access.forWriting(actor, month);
        rows.forEach((details, index) => {
          if (details.date.yearMonth.equals(month)) {
            imported[index] = cashbook.add(randomUUID(), details);
          }
        });
      }
      const garbage = imported.filter((movement) => movement.details.week);
      const weeks = garbage
        .map((movement) => movement.details.week!)
        .sort((a, b) => a.compareTo(b));
      if (weeks.length > 0) {
        const stored = await this.movements.findGarbageForWeeks(weeks[0]!, weeks.at(-1)!);
        const seen = [...stored];
        for (const movement of garbage) {
          assertWeekUnpaid(movement, seen);
          seen.push(movement);
        }
      }
      await this.movements.insert(imported);
      return imported;
    });
  }
}

function groupByMonth(dates: readonly LocalDate[]): LocalDate[][] {
  const months = new Map<string, LocalDate[]>();
  for (const date of [...dates].sort((a, b) => a.compareTo(b))) {
    const key = String(date.yearMonth);
    months.set(key, [...(months.get(key) ?? []), date]);
  }
  return [...months.values()];
}

async function findMovement(movements: CashMovementRepository, id: string): Promise<CashMovement> {
  const movement = await movements.findById(id);
  if (!movement) throw new NotFoundError('MOVEMENT_NOT_FOUND', `There is no movement ${id}`);
  return movement;
}
