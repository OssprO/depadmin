import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { useTestDatabase } from '../../../../test/support/database.js';
import {
  type Actor,
  type AuditedChange,
  type Clock,
  Instant,
  LocalDate,
  UnitNumber,
} from '../../../shared-kernel/index.js';
import { PrismaAuditLogReader } from './prisma-audit-log.reader.js';
import { PrismaAuditTrail } from './prisma-audit-trail.js';

const ctx = useTestDatabase();

const NOW = Instant.ofEpochMillis(Date.parse('2026-10-13T18:30:00.000Z'));
const clock: Clock = { now: () => NOW, today: () => LocalDate.of(2026, 10, 13) };
const trail = () => new PrismaAuditTrail(ctx.database, clock);
const reader = () => new PrismaAuditLogReader(ctx.database);

const admin: Actor = { role: 'SUPERADMIN', userId: 'u-admin' };
const owner501: Actor = { role: 'OWNER', userId: 'u-501', unit: UnitNumber.of(501) };

// The log is append-only, even between tests, so each test writes its own kind of entity
// and reads only that.
const freshEntity = () => `test_${randomBytes(6).toString('hex')}`;

const change = (entity: string, entityId = 'e-1', action = 'THING_CHANGED'): AuditedChange => ({
  action,
  entity,
  entityId,
  entityLabel: `Label ${entityId}`,
  changes: [
    { field: 'amount', before: 70000, after: 75000 },
    { field: 'secret', redacted: true },
  ],
});

async function recordAll(...entries: [Actor, AuditedChange][]) {
  for (const [actor, entry] of entries) {
    await ctx.database.run(() => trail().record(actor, entry));
  }
}

describe('PrismaAuditTrail', () => {
  it('writes the entry with who acted and when, and reads it back', async () => {
    const entity = freshEntity();
    await recordAll([owner501, change(entity)]);

    const { entries, nextCursor } = await reader().page({ entity }, { limit: 10 });
    expect(entries).toEqual([
      {
        id: expect.stringMatching(/^\d+$/) as unknown,
        occurredAt: NOW,
        actor: { role: 'OWNER', unit: UnitNumber.of(501) },
        ...change(entity),
      },
    ]);
    expect(nextCursor).toBeNull();
  });

  it('refuses to write outside a unit of work', async () => {
    const entity = freshEntity();

    await expect(trail().record(admin, change(entity))).rejects.toThrow(/outside a unit of work/);
    expect((await reader().page({ entity }, { limit: 10 })).entries).toEqual([]);
  });

  it('is rolled back with the change it describes', async () => {
    const entity = freshEntity();

    const work = ctx.database.run(async () => {
      await trail().record(admin, change(entity));
      throw new Error('the change failed');
    });

    await expect(work).rejects.toThrow('the change failed');
    expect((await reader().page({ entity }, { limit: 10 })).entries).toEqual([]);
  });
});

describe('PrismaAuditLogReader', () => {
  it('pages newest first with a cursor', async () => {
    const entity = freshEntity();
    await recordAll(
      ...['a', 'b', 'c', 'd', 'e'].map((id): [Actor, AuditedChange] => [admin, change(entity, id)]),
    );

    const first = await reader().page({ entity }, { limit: 2 });
    const second = await reader().page({ entity }, { limit: 2, before: first.nextCursor! });
    const last = await reader().page({ entity }, { limit: 2, before: second.nextCursor! });

    expect([first, second, last].map((p) => p.entries.map((e) => e.entityId))).toEqual([
      ['e', 'd'],
      ['c', 'b'],
      ['a'],
    ]);
    expect(last.nextCursor).toBeNull();
  });

  it('filters by row and by who acted', async () => {
    const entity = freshEntity();
    await recordAll(
      [admin, change(entity, 'x')],
      [owner501, change(entity, 'x')],
      [{ role: 'OWNER', userId: 'u-502', unit: UnitNumber.of(502) }, change(entity, 'y')],
    );
    const ids = async (filter: Parameters<PrismaAuditLogReader['page']>[0]) =>
      (await reader().page({ entity, ...filter }, { limit: 10 })).entries.map(
        (e) => `${e.entityId}:${e.actor.role === 'OWNER' ? e.actor.unit.value : 'admin'}`,
      );

    expect(await ids({ entityId: 'x' })).toEqual(['x:501', 'x:admin']);
    expect(await ids({ actor: 'SUPERADMIN' })).toEqual(['x:admin']);
    expect(await ids({ actor: UnitNumber.of(502) })).toEqual(['y:502']);
    expect(await ids({ actor: UnitNumber.of(101) })).toEqual([]);
  });
});

describe('audit_log constraints', () => {
  const insert = (data: { actorRole: 'OWNER' | 'SUPERADMIN'; actorUnit: number | null }) =>
    ctx.database.client.auditLog.create({
      data: {
        actorId: 'u',
        action: 'TEST',
        entity: freshEntity(),
        entityId: '1',
        entityLabel: '1',
        changes: [],
        ...data,
      },
    });

  it('ties the depto to the owner role', async () => {
    await expect(insert({ actorRole: 'OWNER', actorUnit: null })).rejects.toThrow(
      /audit_log_actor_unit_iff_owner/,
    );
    await expect(insert({ actorRole: 'SUPERADMIN', actorUnit: 501 })).rejects.toThrow(
      /audit_log_actor_unit_iff_owner/,
    );
  });

  it('keeps the changes a JSON array and the codes well formed', async () => {
    const base = {
      actorId: 'u',
      actorRole: 'SUPERADMIN' as const,
      entityId: '1',
      entityLabel: '1',
    };
    const { auditLog } = ctx.database.client;

    await expect(
      auditLog.create({ data: { ...base, action: 'TEST', entity: 'thing', changes: {} } }),
    ).rejects.toThrow(/audit_log_changes_is_array/);
    await expect(
      auditLog.create({ data: { ...base, action: 'test', entity: 'thing', changes: [] } }),
    ).rejects.toThrow(/audit_log_action_valid/);
    await expect(
      auditLog.create({ data: { ...base, action: 'TEST', entity: 'Thing', changes: [] } }),
    ).rejects.toThrow(/audit_log_entity_valid/);
  });
});
