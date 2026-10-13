import { describe, expect, it } from 'vitest';
import { useTestDatabase } from '../../../../test/support/database.js';
import { UnitNumber, YearMonth } from '../../../shared-kernel/index.js';
import { PrismaUnitRepository } from './prisma-unit.repository.js';

const ctx = useTestDatabase();
const repository = () => new PrismaUnitRepository(ctx.database);
const m = (text: string) => YearMonth.parse(text);

describe('PrismaUnitRepository', () => {
  it('loads the ten deptos, active by default', async () => {
    const units = await repository().findAll();
    expect(units.map((u) => u.number.value)).toEqual([
      101, 102, 201, 202, 301, 302, 401, 402, 501, 502,
    ]);
    expect(units.every((u) => u.isActiveIn(m('2026-10')))).toBe(true);
  });

  it('round-trips the inactive history', async () => {
    const unit = await repository().findByNumber(UnitNumber.of(301));
    unit!.deactivate(m('2026-10'));
    unit!.reactivate(m('2027-01'));
    unit!.deactivate(m('2027-06'));
    await repository().save(unit!);

    const loaded = await repository().findByNumber(UnitNumber.of(301));
    expect(loaded!.inactivePeriods.map(String)).toEqual(['2026-10..2026-12', '2027-06..']);
    expect(loaded!.isActiveIn(m('2027-03'))).toBe(true);
  });

  it('replaces the history on save', async () => {
    const unit = await repository().findByNumber(UnitNumber.of(301));
    unit!.deactivate(m('2026-10'));
    await repository().save(unit!);
    unit!.reactivate(m('2026-10'));
    await repository().save(unit!);
    expect((await repository().findByNumber(UnitNumber.of(301)))!.inactivePeriods).toEqual([]);
  });

  it('returns null for a depto that is not stored', async () => {
    await ctx.database.client.unit.delete({ where: { number: 102 } });
    expect(await repository().findByNumber(UnitNumber.of(102))).toBeNull();
  });

  it('rejects overlapping inactive periods in the database itself', async () => {
    const insert = (from: string, to: string | null) =>
      ctx.database.client.unitInactivePeriod.create({
        data: {
          id: crypto.randomUUID(),
          unitNumber: 301,
          fromMonth: new Date(from),
          toMonth: to ? new Date(to) : null,
        },
      });
    await insert('2026-10-01', '2026-12-01');
    await expect(insert('2026-12-01', null)).rejects.toThrow(/no_overlap|exclusion/i);
    await expect(insert('2027-02-15', null)).rejects.toThrow(/months_valid|check/i);
  });
});
