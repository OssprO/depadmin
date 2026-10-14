import { describe, expect, it } from 'vitest';
import { useTestDatabase } from '../../../../test/support/database.js';
import { UnitNumber } from '../../../shared-kernel/index.js';
import { User } from '../domain/index.js';
import { PrismaUserRepository } from './prisma-user.repository.js';

const ctx = useTestDatabase();
const repository = () => new PrismaUserRepository(ctx.database);
const owner = (unit: number) => User.createOwner(crypto.randomUUID(), UnitNumber.of(unit));

describe('PrismaUserRepository', () => {
  it('round-trips a user and finds it by id or case-insensitive username', async () => {
    const user = owner(501);
    user.resetPassword('temporary-hash');
    await repository().save(user);

    const byId = await repository().findById(user.id);
    expect(byId).toMatchObject({
      username: '501',
      role: 'OWNER',
      unit: UnitNumber.of(501),
      passwordHash: 'temporary-hash',
      mustChangePassword: true,
    });
    await repository().save(User.createSuperadmin(crypto.randomUUID(), 'admin', 'hash'));
    expect((await repository().findByUsername(' ADMIN '))?.role).toBe('SUPERADMIN');
    expect(await repository().findByUsername('nobody')).toBeNull();
    expect(await repository().findById(crypto.randomUUID())).toBeNull();
  });

  it('updates an existing user on save', async () => {
    const user = owner(501);
    await repository().save(user);
    user.resetPassword('temporary-hash');
    user.changePassword('final-hash');
    await repository().save(user);

    expect(await repository().findById(user.id)).toMatchObject({
      passwordHash: 'final-hash',
      mustChangePassword: false,
    });
  });

  it('lists the superadmin first, then the deptos in order', async () => {
    for (const unit of [502, 101, 301]) await repository().save(owner(unit));
    await repository().save(User.createSuperadmin(crypto.randomUUID(), 'admin', 'hash'));

    expect((await repository().findAll()).map((u) => u.username)).toEqual([
      'admin',
      '101',
      '301',
      '502',
    ]);
  });

  it('allows one owner per depto', async () => {
    await repository().save(owner(501));
    await expect(repository().save(owner(501))).rejects.toThrow();
  });

  it('enforces the user invariants in the database itself', async () => {
    const insert = (data: { username: string; role: 'OWNER' | 'SUPERADMIN'; unit?: number }) =>
      ctx.database.client.user.create({
        data: {
          id: crypto.randomUUID(),
          username: data.username,
          role: data.role,
          unitNumber: data.unit ?? null,
        },
      });

    await expect(insert({ username: 'Admin', role: 'SUPERADMIN' })).rejects.toThrow(
      /app_user_username_valid/,
    );
    await expect(insert({ username: 'admin', role: 'SUPERADMIN', unit: 501 })).rejects.toThrow(
      /app_user_unit_iff_owner/,
    );
    await expect(insert({ username: '501', role: 'OWNER' })).rejects.toThrow(
      /app_user_unit_iff_owner/,
    );
    await expect(
      ctx.database.client.user.create({
        data: {
          id: crypto.randomUUID(),
          username: '501',
          role: 'OWNER',
          unitNumber: 501,
          mustChangePassword: true,
        },
      }),
    ).rejects.toThrow(/app_user_password_change_needs_password/);
  });
});
