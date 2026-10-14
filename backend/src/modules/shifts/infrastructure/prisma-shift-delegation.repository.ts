import { Injectable } from '@nestjs/common';
import { fromDbMonth, toDbMonth } from '../../../platform/prisma/db-values.js';
import type { ShiftDelegation as DelegationRow } from '../../../platform/prisma/generated/client.js';
import { translateViolations } from '../../../platform/prisma/db-errors.js';
import { PrismaDatabase } from '../../../platform/prisma/prisma-database.js';
import {
  ConflictError,
  UnitNumber,
  type YearMonth,
  YearMonthRange,
} from '../../../shared-kernel/index.js';
import { ShiftDelegation, type ShiftDelegationRepository } from '../domain/index.js';

@Injectable()
export class PrismaShiftDelegationRepository implements ShiftDelegationRepository {
  constructor(private readonly database: PrismaDatabase) {}

  async findById(id: string): Promise<ShiftDelegation | null> {
    const row = await this.database.db.shiftDelegation.findUnique({ where: { id } });
    return row && toDomain(row);
  }

  async findOverlapping(from: YearMonth, to: YearMonth): Promise<ShiftDelegation[]> {
    const rows = await this.database.db.shiftDelegation.findMany({
      where: { fromMonth: { lte: toDbMonth(to) }, toMonth: { gte: toDbMonth(from) } },
      orderBy: [{ fromMonth: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map(toDomain);
  }

  /** Delegations are immutable except for being cancelled, which stamps the time once. */
  save(delegation: ShiftDelegation): Promise<void> {
    return translateViolations(() => this.saveRow(delegation), {
      shift_delegation_no_overlap: () =>
        new ConflictError('DELEGATIONS_OVERLAP', 'Another delegation took those months meanwhile'),
    });
  }

  private saveRow(delegation: ShiftDelegation): Promise<void> {
    return this.database.run(async () => {
      const { db } = this.database;
      const existing = await db.shiftDelegation.findUnique({ where: { id: delegation.id } });
      const cancelledAt = delegation.isActive ? null : (existing?.cancelledAt ?? new Date());
      if (existing) {
        await db.shiftDelegation.update({ where: { id: delegation.id }, data: { cancelledAt } });
        return;
      }
      await db.shiftDelegation.create({
        data: {
          id: delegation.id,
          fromMonth: toDbMonth(delegation.months.from),
          toMonth: toDbMonth(delegation.months.to ?? delegation.months.from),
          originalUnit: delegation.originalUnit.value,
          delegateUnit: delegation.delegateUnit.value,
          reason: delegation.reason,
          cancelledAt,
        },
      });
    });
  }
}

function toDomain(row: DelegationRow): ShiftDelegation {
  return ShiftDelegation.create({
    id: row.id,
    months: YearMonthRange.between(fromDbMonth(row.fromMonth), fromDbMonth(row.toMonth)),
    originalUnit: UnitNumber.of(row.originalUnit),
    delegateUnit: UnitNumber.of(row.delegateUnit),
    reason: row.reason,
    cancelled: row.cancelledAt !== null,
  });
}
