import { Injectable } from '@nestjs/common';
import { fromDbInstant, toDbInstant } from '../../../platform/prisma/db-values.js';
import type { RefreshToken as TokenRow } from '../../../platform/prisma/generated/client.js';
import { PrismaDatabase } from '../../../platform/prisma/prisma-database.js';
import type { Instant } from '../../../shared-kernel/index.js';
import { RefreshToken, type RefreshTokenRepository } from '../domain/index.js';

@Injectable()
export class PrismaRefreshTokenRepository implements RefreshTokenRepository {
  constructor(private readonly database: PrismaDatabase) {}

  async findByHash(tokenHash: string): Promise<RefreshToken | null> {
    const row = await this.database.db.refreshToken.findUnique({ where: { tokenHash } });
    return row && toDomain(row);
  }

  async add(token: RefreshToken): Promise<void> {
    await this.database.db.refreshToken.create({
      data: {
        id: token.id,
        sessionId: token.sessionId,
        userId: token.userId,
        tokenHash: token.tokenHash,
        expiresAt: toDbInstant(token.expiresAt),
      },
    });
  }

  /**
   * A compare-and-set: the UPDATE only matches while the token is still unused, and Postgres
   * row locks make a concurrent second UPDATE wait and then match nothing.
   */
  rotate(rotated: RefreshToken, next: RefreshToken): Promise<boolean> {
    return this.database.run(async () => {
      const { count } = await this.database.db.refreshToken.updateMany({
        where: { id: rotated.id, rotatedAt: null, revokedAt: null },
        data: { rotatedAt: rotated.rotatedAt && toDbInstant(rotated.rotatedAt) },
      });
      if (count === 0) return false;
      await this.add(next);
      return true;
    });
  }

  async revokeSession(sessionId: string, at: Instant): Promise<void> {
    await this.database.db.refreshToken.updateMany({
      where: { sessionId, revokedAt: null },
      data: { revokedAt: toDbInstant(at) },
    });
  }

  async deleteExpired(at: Instant): Promise<number> {
    const { count } = await this.database.db.refreshToken.deleteMany({
      where: { expiresAt: { lt: toDbInstant(at) } },
    });
    return count;
  }

  async revokeAllOf(userId: string, at: Instant): Promise<void> {
    await this.database.db.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: toDbInstant(at) },
    });
  }
}

function toDomain(row: TokenRow): RefreshToken {
  return RefreshToken.restore({
    id: row.id,
    sessionId: row.sessionId,
    userId: row.userId,
    tokenHash: row.tokenHash,
    expiresAt: fromDbInstant(row.expiresAt),
    rotatedAt: row.rotatedAt && fromDbInstant(row.rotatedAt),
    revokedAt: row.revokedAt && fromDbInstant(row.revokedAt),
  });
}
