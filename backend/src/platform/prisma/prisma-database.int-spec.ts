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

  it('uses the shared client outside a transaction', () => {
    expect(ctx.database.db).toBe(ctx.database.client);
  });
});

describe('audit_log is append-only', () => {
  const insert = () =>
    ctx.database.client.auditLog.create({
      data: { actorId: 'admin', action: 'TEST', entity: 'unit', entityId: '101', changes: [] },
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
