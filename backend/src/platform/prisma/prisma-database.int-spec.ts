import { describe, expect, it } from 'vitest';
import { useTestDatabase } from '../../../test/support/database.js';

const ctx = useTestDatabase();

describe('PrismaDatabase (unit of work)', () => {
  it('commits everything done inside run', async () => {
    await ctx.database.run(async () => {
      await ctx.database.db.unitInactivePeriod.create({
        data: { id: crypto.randomUUID(), unitNumber: 101, fromMonth: new Date('2026-10-01') },
      });
    });
    expect(await ctx.database.client.unitInactivePeriod.count()).toBe(1);
  });

  it('rolls back everything when the work fails, nested calls included', async () => {
    const work = ctx.database.run(async () => {
      await ctx.database.run(async () => {
        await ctx.database.db.unitInactivePeriod.create({
          data: { id: crypto.randomUUID(), unitNumber: 101, fromMonth: new Date('2026-10-01') },
        });
      });
      throw new Error('boom');
    });
    await expect(work).rejects.toThrow('boom');
    expect(await ctx.database.client.unitInactivePeriod.count()).toBe(0);
  });

  it('runs the work again when the database aborts it for a deadlock', async () => {
    // Two transactions take the same two rows in opposite order: each holds one and waits
    // for the other. Postgres aborts one of them, which runs again once the other commits.
    let attempts = 0;
    let arrived = 0;
    let bothHoldOne!: () => void;
    const holding = new Promise<void>((resolve) => (bothHoldOne = resolve));
    const rename = (first: number, second: number) =>
      ctx.database.run(async () => {
        attempts++;
        const { db } = ctx.database;
        await db.$executeRaw`UPDATE unit SET owner_name = ${`by ${first}`} WHERE number = ${first}`;
        if (++arrived === 2) bothHoldOne();
        await holding;
        await db.$executeRaw`UPDATE unit SET owner_name = ${`by ${first}`} WHERE number = ${second}`;
      });

    await Promise.all([rename(101, 102), rename(102, 101)]);

    expect(attempts).toBe(3);
    const names = await ctx.database.client.unit.findMany({
      where: { number: { in: [101, 102] } },
    });
    // Whichever ran last renamed both.
    expect(new Set(names.map((unit) => unit.ownerName)).size).toBe(1);
  });

  it('runs what waits for the commit once it commits, and never after a rollback', async () => {
    const effects: string[] = [];
    await ctx.database.run(async () => {
      ctx.database.afterCommit(() => effects.push('outer'));
      await ctx.database.run(() => {
        ctx.database.afterCommit(() => effects.push('nested'));
        expect(effects).toEqual([]);
        return Promise.resolve();
      });
    });
    expect(effects).toEqual(['outer', 'nested']);

    await expect(
      ctx.database.run(() => {
        ctx.database.afterCommit(() => effects.push('rolled back'));
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    ctx.database.afterCommit(() => effects.push('outside'));
    expect(effects).toEqual(['outer', 'nested', 'outside']);
  });

  it('forgets what an attempt aborted for a deadlock registered', async () => {
    let arrived = 0;
    let bothHoldOne!: () => void;
    const holding = new Promise<void>((resolve) => (bothHoldOne = resolve));
    const effects: number[] = [];
    const rename = (first: number, second: number) =>
      ctx.database.run(async () => {
        ctx.database.afterCommit(() => effects.push(first));
        const { db } = ctx.database;
        await db.$executeRaw`UPDATE unit SET owner_name = 'x' WHERE number = ${first}`;
        if (++arrived === 2) bothHoldOne();
        await holding;
        await db.$executeRaw`UPDATE unit SET owner_name = 'x' WHERE number = ${second}`;
      });

    await Promise.all([rename(101, 102), rename(102, 101)]);

    expect(effects.sort()).toEqual([101, 102]);
  });

  it('uses the shared client outside a transaction', () => {
    expect(ctx.database.db).toBe(ctx.database.client);
  });
});

describe('audit_log is append-only', () => {
  const insert = () =>
    ctx.database.client.auditLog.create({
      data: {
        actorId: 'admin',
        actorRole: 'SUPERADMIN',
        action: 'TEST',
        entity: 'unit',
        entityId: '101',
        entityLabel: '101',
        changes: [],
      },
    });

  it('accepts inserts', async () => {
    const row = await insert();
    expect(row.id).toBeTypeOf('bigint');
  });

  it('rejects updates, deletes and truncates, even from the table owner', async () => {
    const row = await insert();
    const { client } = ctx.database;
    await expect(
      client.auditLog.update({ where: { id: row.id }, data: { action: 'CHANGED' } }),
    ).rejects.toThrow(/append-only/);
    await expect(client.auditLog.delete({ where: { id: row.id } })).rejects.toThrow(/append-only/);
    await expect(client.$executeRawUnsafe('TRUNCATE audit_log')).rejects.toThrow(/append-only/);
    expect((await client.auditLog.findUnique({ where: { id: row.id } }))?.action).toBe('TEST');
  });
});
