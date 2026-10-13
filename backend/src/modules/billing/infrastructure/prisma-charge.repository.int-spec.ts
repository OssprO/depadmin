import { describe, expect, it } from 'vitest';
import { useTestDatabase } from '../../../../test/support/database.js';
import { Money, UnitNumber, YearMonth } from '../../../shared-kernel/index.js';
import { Charge, type ChargeType } from '../domain/index.js';
import { PrismaChargeRepository } from './prisma-charge.repository.js';

const ctx = useTestDatabase();
const repository = () => new PrismaChargeRepository(ctx.database);
const charge = (unit: number, month: string, type: ChargeType = 'MAINTENANCE_FEE', pesos = 700) =>
  Charge.create(UnitNumber.of(unit), YearMonth.parse(month), type, Money.ofPesos(pesos));
const keys = (charges: Charge[]) => charges.map((c) => `${c.key}=${c.amount}`).sort();

describe('PrismaChargeRepository', () => {
  it('finds charges by depto and by month', async () => {
    await repository().save([
      charge(301, '2026-09'),
      charge(301, '2026-10'),
      charge(301, '2026-10', 'SHIFT_SKIP_PENALTY', 500),
      charge(302, '2026-10'),
    ]);
    expect(keys(await repository().findByUnit(UnitNumber.of(301)))).toEqual([
      '301:2026-09:MAINTENANCE_FEE=700.00',
      '301:2026-10:MAINTENANCE_FEE=700.00',
      '301:2026-10:SHIFT_SKIP_PENALTY=500.00',
    ]);
    expect(keys(await repository().findByMonth(YearMonth.of(2026, 10)))).toHaveLength(3);
  });

  it('is idempotent by key and updates amounts', async () => {
    await repository().save([charge(301, '2026-10')]);
    await repository().save([charge(301, '2026-10', 'MAINTENANCE_FEE', 750)]);
    expect(keys(await repository().findByUnit(UnitNumber.of(301)))).toEqual([
      '301:2026-10:MAINTENANCE_FEE=750.00',
    ]);
  });

  it('removes the given charges only', async () => {
    const penalty = charge(301, '2026-10', 'SHIFT_SKIP_PENALTY', 500);
    await repository().save([charge(301, '2026-10'), penalty]);
    await repository().remove([penalty]);
    await repository().remove([]);
    expect(keys(await repository().findByUnit(UnitNumber.of(301)))).toEqual([
      '301:2026-10:MAINTENANCE_FEE=700.00',
    ]);
  });
});
