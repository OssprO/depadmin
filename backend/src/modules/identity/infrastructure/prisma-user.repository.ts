import { Injectable } from '@nestjs/common';
import type { User as UserRow } from '../../../platform/prisma/generated/client.js';
import { translateViolations } from '../../../platform/prisma/db-errors.js';
import { fromDbDate, toDbDate } from '../../../platform/prisma/db-values.js';
import { PrismaDatabase } from '../../../platform/prisma/prisma-database.js';
import { ConflictError, UnitNumber } from '../../../shared-kernel/index.js';
import { normalizeUsername, User, type UserRepository } from '../domain/index.js';

@Injectable()
export class PrismaUserRepository implements UserRepository {
  constructor(private readonly database: PrismaDatabase) {}

  async findById(id: string): Promise<User | null> {
    const row = await this.database.db.user.findUnique({ where: { id } });
    return row && toDomain(row);
  }

  async findByUsername(username: string): Promise<User | null> {
    const row = await this.database.db.user.findUnique({
      where: { username: normalizeUsername(username) },
    });
    return row && toDomain(row);
  }

  async findAll(): Promise<User[]> {
    // Enums sort in declaration order: SUPERADMIN first, then the owners by depto, then
    // the read-only users by depto (those of none last) and name.
    const rows = await this.database.db.user.findMany({
      orderBy: [
        { role: 'asc' },
        { unitNumber: { sort: 'asc', nulls: 'last' } },
        { username: 'asc' },
      ],
    });
    return rows.map(toDomain);
  }

  save(user: User): Promise<void> {
    const data = {
      username: user.username,
      role: user.role,
      unitNumber: user.unit?.value ?? null,
      passwordHash: user.passwordHash,
      mustChangePassword: user.mustChangePassword,
      expiresOn: user.expiresOn && toDbDate(user.expiresOn),
      disabled: user.disabled,
    };
    return translateViolations(
      async () => {
        await this.database.db.user.upsert({
          where: { id: user.id },
          create: { id: user.id, ...data },
          update: data,
        });
      },
      {
        // An owner is named after its depto, so a second owner clashes here first.
        app_user_username_key: () =>
          new ConflictError('USERNAME_TAKEN', `The username ${user.username} is taken`),
      },
    );
  }
}

function toDomain(row: UserRow): User {
  return User.restore({
    id: row.id,
    username: row.username,
    role: row.role,
    unit: row.unitNumber === null ? null : UnitNumber.of(row.unitNumber),
    passwordHash: row.passwordHash,
    mustChangePassword: row.mustChangePassword,
    expiresOn: row.expiresOn && fromDbDate(row.expiresOn),
    disabled: row.disabled,
  });
}
