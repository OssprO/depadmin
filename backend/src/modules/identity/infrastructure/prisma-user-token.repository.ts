import { Injectable } from '@nestjs/common';
import { fromDbInstant, toDbInstant } from '../../../platform/prisma/db-values.js';
import type { UserToken as TokenRow } from '../../../platform/prisma/generated/client.js';
import { PrismaDatabase } from '../../../platform/prisma/prisma-database.js';
import type { Instant } from '../../../shared-kernel/index.js';
import { UserToken, type UserTokenPurpose, type UserTokenRepository } from '../domain/index.js';

@Injectable()
export class PrismaUserTokenRepository implements UserTokenRepository {
  constructor(private readonly database: PrismaDatabase) {}

  async findByHash(tokenHash: string): Promise<UserToken | null> {
    const row = await this.database.db.userToken.findUnique({ where: { tokenHash } });
    return row && toDomain(row);
  }

  async add(token: UserToken): Promise<void> {
    await this.database.db.userToken.create({
      data: {
        id: token.id,
        userId: token.userId,
        purpose: token.purpose,
        tokenHash: token.tokenHash,
        email: token.email,
        expiresAt: toDbInstant(token.expiresAt),
        createdAt: toDbInstant(token.createdAt),
      },
    });
  }

  /**
   * A compare-and-set, like a refresh token's rotation: the UPDATE matches only while the link
   * is unused, and a concurrent second one waits for the row lock and then matches nothing.
   */
  async use(token: UserToken, at: Instant): Promise<boolean> {
    const { count } = await this.database.db.userToken.updateMany({
      where: {
        id: token.id,
        usedAt: null,
        revokedAt: null,
        expiresAt: { gt: toDbInstant(at) },
      },
      data: { usedAt: toDbInstant(at) },
    });
    return count === 1;
  }

  async revokeActive(userId: string, purpose: UserTokenPurpose, at: Instant): Promise<void> {
    await this.database.db.userToken.updateMany({
      where: { userId, purpose, usedAt: null, revokedAt: null, expiresAt: { gt: toDbInstant(at) } },
      data: { revokedAt: toDbInstant(at) },
    });
  }

  countIssuedSince(userId: string, purpose: UserTokenPurpose, since: Instant): Promise<number> {
    return this.database.db.userToken.count({
      where: { userId, purpose, createdAt: { gt: toDbInstant(since) } },
    });
  }

  async deleteExpired(at: Instant): Promise<number> {
    const { count } = await this.database.db.userToken.deleteMany({
      where: { expiresAt: { lt: toDbInstant(at) } },
    });
    return count;
  }
}

function toDomain(row: TokenRow): UserToken {
  return UserToken.restore({
    id: row.id,
    userId: row.userId,
    purpose: row.purpose,
    tokenHash: row.tokenHash,
    email: row.email,
    expiresAt: fromDbInstant(row.expiresAt),
    usedAt: row.usedAt && fromDbInstant(row.usedAt),
    revokedAt: row.revokedAt && fromDbInstant(row.revokedAt),
    createdAt: fromDbInstant(row.createdAt),
  });
}
