import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { sessionResponseSchema } from '@depadmin/shared';
import request from 'supertest';
import { User } from '../../src/modules/identity/domain/index.js';
import { Argon2PasswordHasher } from '../../src/modules/identity/infrastructure/argon2-password-hasher.js';
import { PrismaUserRepository } from '../../src/modules/identity/infrastructure/prisma-user.repository.js';
import type { PrismaDatabase } from '../../src/platform/prisma/prisma-database.js';
import { UnitNumber } from '../../src/shared-kernel/index.js';

export const PASSWORD = 'integration password';

/** The superadmin ("admin") and the given owners, all with `PASSWORD`. */
export async function givenAccounts(database: PrismaDatabase, owners: number[]): Promise<void> {
  const users = new PrismaUserRepository(database);
  const hash = await new Argon2PasswordHasher().hash(PASSWORD);
  await users.save(User.createSuperadmin(randomUUID(), 'admin', hash));
  for (const unit of owners) {
    const owner = User.createOwner(randomUUID(), UnitNumber.of(unit));
    owner.changePassword(hash);
    await users.save(owner);
  }
}

/** Signs in and returns the access token. */
export async function tokenFor(app: NestExpressApplication, username: string): Promise<string> {
  const response = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ username, password: PASSWORD })
    .expect(200);
  return sessionResponseSchema.parse(response.body).accessToken;
}
