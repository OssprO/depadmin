import { describe, expect, it } from 'vitest';
import { useTestDatabase } from '../../../../test/support/database.js';
import { UnitNumber, YearMonth, YearMonthRange } from '../../../shared-kernel/index.js';
import { type DelegationReason, ShiftDelegation } from '../domain/index.js';
import { PrismaShiftDelegationRepository } from './prisma-shift-delegation.repository.js';

const ctx = useTestDatabase();
const repository = () => new PrismaShiftDelegationRepository(ctx.database);
const m = (text: string) => YearMonth.parse(text);
const delegation = (from: string, to: string, reason: DelegationReason = 'SKIPPED_SHIFT') =>
  ShiftDelegation.create({
    id: crypto.randomUUID(),
    months: YearMonthRange.between(m(from), m(to)),
    originalUnit: UnitNumber.of(502),
    delegateUnit: UnitNumber.of(501),
    reason,
  });

describe('PrismaShiftDelegationRepository', () => {
  it('round-trips a delegation', async () => {
    const saved = delegation('2026-10', '2026-11');
    await repository().save(saved);
    const loaded = await repository().findById(saved.id);
    expect(loaded).toMatchObject({ id: saved.id, reason: 'SKIPPED_SHIFT', isActive: true });
    expect(String(loaded!.months)).toBe('2026-10..2026-11');
    expect(loaded!.originalUnit).toBe(UnitNumber.of(502));
    expect(await repository().findById(crypto.randomUUID())).toBeNull();
  });

  it('finds delegations overlapping a range', async () => {
    await repository().save(delegation('2026-10', '2026-11'));
    await repository().save(delegation('2027-02', '2027-02', 'OTHER'));
    const found = await repository().findOverlapping(m('2026-11'), m('2027-01'));
    expect(found.map((d) => String(d.months))).toEqual(['2026-10..2026-11']);
    expect(await repository().findOverlapping(m('2026-01'), m('2030-01'))).toHaveLength(2);
  });

  it('stamps the cancellation once', async () => {
    const saved = delegation('2026-10', '2026-11');
    await repository().save(saved);
    saved.cancel();
    await repository().save(saved);
    const first = await ctx.database.client.shiftDelegation.findUnique({ where: { id: saved.id } });
    await repository().save(saved);
    const second = await ctx.database.client.shiftDelegation.findUnique({
      where: { id: saved.id },
    });
    expect(first!.cancelledAt).not.toBeNull();
    expect(second!.cancelledAt).toEqual(first!.cancelledAt);
    expect((await repository().findById(saved.id))!.isActive).toBe(false);
  });

  it('allows a single active delegation per month in the database itself', async () => {
    const first = delegation('2026-10', '2026-11');
    await repository().save(first);
    await expect(repository().save(delegation('2026-11', '2026-11', 'OTHER'))).rejects.toThrow(
      /no_overlap|exclusion/i,
    );
    first.cancel();
    await repository().save(first);
    await expect(
      repository().save(delegation('2026-11', '2026-11', 'OTHER')),
    ).resolves.toBeUndefined();
  });
});
