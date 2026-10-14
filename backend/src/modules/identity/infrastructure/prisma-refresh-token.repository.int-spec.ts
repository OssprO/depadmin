import { beforeEach, describe, expect, it } from 'vitest';
import { useTestDatabase } from '../../../../test/support/database.js';
import { Instant, UnitNumber } from '../../../shared-kernel/index.js';
import { RefreshToken, User } from '../domain/index.js';
import { PrismaRefreshTokenRepository } from './prisma-refresh-token.repository.js';
import { PrismaUserRepository } from './prisma-user.repository.js';

const ctx = useTestDatabase();
const repository = () => new PrismaRefreshTokenRepository(ctx.database);
const now = Instant.ofEpochMillis(Date.parse('2026-10-13T12:00:00.000Z'));
const hash = (n: number) => n.toString(16).padStart(64, '0');

let userId: string;
let counter = 0;

function newToken(sessionId = crypto.randomUUID(), owner = userId): RefreshToken {
  counter++;
  return RefreshToken.issue(
    { id: crypto.randomUUID(), tokenHash: hash(counter) },
    { id: sessionId, userId: owner },
    now,
  );
}

const fresh = () => ({ id: crypto.randomUUID(), tokenHash: hash(++counter) });

describe('PrismaRefreshTokenRepository', () => {
  beforeEach(async () => {
    const user = User.createOwner(crypto.randomUUID(), UnitNumber.of(501));
    await new PrismaUserRepository(ctx.database).save(user);
    userId = user.id;
  });

  it('stores tokens and finds them by hash, with exact instants', async () => {
    const token = newToken();
    await repository().add(token);

    const found = await repository().findByHash(token.tokenHash);
    expect(found).toMatchObject({ id: token.id, sessionId: token.sessionId, userId });
    expect(found?.expiresAt).toEqual(token.expiresAt);
    expect(found?.stateAt(now)).toBe('ACTIVE');
    expect(await repository().findByHash(hash(999_999))).toBeNull();
  });

  it('rotates a token once, adding its successor', async () => {
    const token = newToken();
    await repository().add(token);
    const first = token.rotate(fresh(), now);
    const second = token.rotate(fresh(), now);

    expect(await repository().rotate(first.rotated, first.next)).toBe(true);
    expect(await repository().rotate(second.rotated, second.next)).toBe(false);

    expect((await repository().findByHash(token.tokenHash))?.stateAt(now)).toBe('ROTATED');
    expect((await repository().findByHash(first.next.tokenHash))?.stateAt(now)).toBe('ACTIVE');
    expect(await repository().findByHash(second.next.tokenHash)).toBeNull();
  });

  it('lets only one of two concurrent rotations win', async () => {
    const token = newToken();
    await repository().add(token);
    const attempts = [token.rotate(fresh(), now), token.rotate(fresh(), now)];

    const results = await Promise.all(
      attempts.map(({ rotated, next }) => repository().rotate(rotated, next)),
    );

    expect(results.sort()).toEqual([false, true]);
  });

  it('revokes one session, or every session of a user', async () => {
    const phone = newToken();
    const laptop = newToken();
    await repository().add(phone);
    await repository().add(laptop);

    await repository().revokeSession(phone.sessionId, now);
    expect((await repository().findByHash(phone.tokenHash))?.stateAt(now)).toBe('REVOKED');
    expect((await repository().findByHash(laptop.tokenHash))?.stateAt(now)).toBe('ACTIVE');

    await repository().revokeAllOf(userId, now.plusSeconds(1));
    const revoked = await repository().findByHash(laptop.tokenHash);
    expect(revoked?.revokedAt).toEqual(now.plusSeconds(1));
    // A revocation is stamped once.
    expect((await repository().findByHash(phone.tokenHash))?.revokedAt).toEqual(now);
  });

  it('deletes the tokens that expired before a moment, and only those', async () => {
    const token = newToken();
    await repository().add(token);

    expect(await repository().deleteExpired(token.expiresAt)).toBe(0);
    expect(await repository().deleteExpired(token.expiresAt.plusDays(1))).toBe(1);
    expect(await repository().findByHash(token.tokenHash)).toBeNull();
  });
});
