import { Injectable } from '@nestjs/common';
import type { User as UserRow } from '../../../platform/prisma/generated/client.js';
import { PrismaDatabase } from '../../../platform/prisma/prisma-database.js';
import { UnitNumber } from '../../../shared-kernel/index.js';
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
    // Enums sort in declaration order: SUPERADMIN first, then the deptos by number.
    const rows = await this.database.db.user.findMany({
      orderBy: [{ role: 'asc' }, { unitNumber: 'asc' }],
    });
    return rows.map(toDomain);
  }

  async save(user: User): Promise<void> {
    const data = {
      username: user.username,
      role: user.role,
      unitNumber: user.unit?.value ?? null,
      passwordHash: user.passwordHash,
      mustChangePassword: user.mustChangePassword,
    };
    await this.database.db.user.upsert({
      where: { id: user.id },
      create: { id: user.id, ...data },
      update: data,
    });
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
  });
}
