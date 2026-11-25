import { describe, expect, it } from 'vitest';
import { useTestDatabase } from '../../../../test/support/database.js';
import { Instant, UnitNumber } from '../../../shared-kernel/index.js';
import { User, UserToken } from '../domain/index.js';
import { PrismaUserRepository } from './prisma-user.repository.js';
import { PrismaUserTokenRepository } from './prisma-user-token.repository.js';

const ctx = useTestDatabase();
const repository = () => new PrismaUserTokenRepository(ctx.database);
const now = Instant.ofEpochMillis(Date.parse('2026-11-25T18:00:00.000Z'));

async function givenOwner(): Promise<User> {
  const user = User.createOwner(crypto.randomUUID(), UnitNumber.of(501));
  await new PrismaUserRepository(ctx.database).save(user);
  return user;
}

const recovery = (userId: string, hash: string, at = now) =>
  UserToken.passwordRecovery({ id: crypto.randomUUID(), tokenHash: hash }, userId, at);

describe('PrismaUserTokenRepository', () => {
  it('round-trips a link, found by its hash', async () => {
    const { id } = await givenOwner();
    const link = UserToken.emailConfirmation(
      { id: crypto.randomUUID(), tokenHash: 'hash-1' },
      id,
      'vecina@ejemplo.mx',
      now,
    );
    await repository().add(link);

    expect(await repository().findByHash('hash-1')).toEqual(link);
    expect(await repository().findByHash('nope')).toBeNull();
  });

  it('uses a link only once, even when two requests race', async () => {
    const { id } = await givenOwner();
    const link = recovery(id, 'hash-1');
    await repository().add(link);

    const results = await Promise.all([repository().use(link, now), repository().use(link, now)]);

    expect(results.sort()).toEqual([false, true]);
    expect((await repository().findByHash('hash-1'))?.stateAt(now)).toBe('USED');
  });

  it('does not use an expired link', async () => {
    const { id } = await givenOwner();
    const link = recovery(id, 'hash-1');
    await repository().add(link);

    expect(await repository().use(link, link.expiresAt)).toBe(false);
  });

  it('revokes the active links of one purpose, and counts those sent since a moment', async () => {
    const { id } = await givenOwner();
    const old = recovery(id, 'hash-old', now.plusSeconds(-2 * 60 * 60));
    const active = recovery(id, 'hash-active');
    const confirmation = UserToken.emailConfirmation(
      { id: crypto.randomUUID(), tokenHash: 'hash-confirm' },
      id,
      'vecina@ejemplo.mx',
      now,
    );
    for (const link of [old, active, confirmation]) await repository().add(link);

    await repository().revokeActive(id, 'PASSWORD_RECOVERY', now);

    expect((await repository().findByHash('hash-active'))?.stateAt(now)).toBe('REVOKED');
    expect((await repository().findByHash('hash-old'))?.revokedAt).toBeNull();
    expect((await repository().findByHash('hash-confirm'))?.stateAt(now)).toBe('ACTIVE');
    const anHourAgo = now.plusSeconds(-60 * 60);
    expect(await repository().countIssuedSince(id, 'PASSWORD_RECOVERY', anHourAgo)).toBe(1);
    expect(await repository().countIssuedSince(id, 'EMAIL_CONFIRMATION', anHourAgo)).toBe(1);
  });

  it('deletes only the links that expired', async () => {
    const { id } = await givenOwner();
    await repository().add(recovery(id, 'hash-old', now.plusSeconds(-2 * 60 * 60)));
    await repository().add(recovery(id, 'hash-new'));

    expect(await repository().deleteExpired(now)).toBe(1);
    expect(await repository().findByHash('hash-new')).not.toBeNull();
  });
});
