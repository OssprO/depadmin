import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  type Actor,
  AUDIT_TRAIL,
  type AuditTrail,
  creationOf,
  type LocalDate,
  type Money,
  NotFoundError,
  removalOf,
  trackChanges,
  UNIT_OF_WORK,
  type UnitOfWork,
} from '../../../shared-kernel/index.js';
import {
  assertNewVisits,
  CASH_MOVEMENT_REPOSITORY,
  type CashMovement,
  type CashMovementRepository,
  type MovementDetails,
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
      await this.audit.record(
        actor,
        creationOf(MOVEMENT_AUDIT, MovementAuditAction.ADDED, movement),
      );
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
      await this.audit.record(actor, tracked.change(MovementAuditAction.REVISED, movement));
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
      await this.audit.record(
        actor,
        removalOf(MOVEMENT_AUDIT, MovementAuditAction.REMOVED, stored),
      );
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
        await this.audit.record(
          actor,
          creationOf(MOVEMENT_AUDIT, MovementAuditAction.ADDED, movement),
        );
      }
      return recorded;
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
