import { randomUUID } from 'node:crypto';
import {
  currentUserSchema,
  passwordResetResponseSchema,
  problemDetailsSchema,
  sessionResponseSchema,
  userListResponseSchema,
} from '@depadmin/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { User } from '../src/modules/identity/domain/index.js';
import { Argon2PasswordHasher } from '../src/modules/identity/infrastructure/argon2-password-hasher.js';
import { PrismaUserRepository } from '../src/modules/identity/infrastructure/prisma-user.repository.js';
import { UnitNumber } from '../src/shared-kernel/index.js';
import { useTestApp } from './support/app.js';
import { useTestDatabase } from './support/database.js';

const ctx = useTestDatabase();
const api = useTestApp();
const http = () => request(api.app.getHttpServer());

const ADMIN_PASSWORD = 'admin password 123';
const OWNER_PASSWORD = 'la casa del 501';
let ownerId: string;

beforeEach(async () => {
  const users = new PrismaUserRepository(ctx.database);
  const hasher = new Argon2PasswordHasher();
  await users.save(User.createSuperadmin(randomUUID(), 'admin', await hasher.hash(ADMIN_PASSWORD)));
  const owner = User.createOwner(randomUUID(), UnitNumber.of(501));
  owner.changePassword(await hasher.hash(OWNER_PASSWORD));
  await users.save(owner);
  await users.save(User.createOwner(randomUUID(), UnitNumber.of(502)));
  ownerId = owner.id;
});

/** The refresh cookie from a response, as "name=value" ready to send back. */
function refreshCookieOf(response: request.Response): string {
  const header = [response.headers['set-cookie'] ?? []].flat();
  const cookie = header.find((c) => c.startsWith('depadmin_refresh='));
  if (!cookie) throw new Error('No refresh cookie in the response');
  return cookie.split(';')[0]!;
}

async function login(username: string, password: string) {
  const response = await http().post('/api/auth/login').send({ username, password }).expect(200);
  const session = sessionResponseSchema.parse(response.body);
  return { response, session, accessToken: session.accessToken, cookie: refreshCookieOf(response) };
}

const expectProblem = (response: request.Response, status: number, code: string) => {
  expect(response.status).toBe(status);
  expect(problemDetailsSchema.parse(response.body).code).toBe(code);
};

describe('auth API', () => {
  it('signs in and returns the user, with the refresh token only in a strict cookie', async () => {
    const { response, session, accessToken } = await login('501', OWNER_PASSWORD);

    expect(session.user).toMatchObject({ username: '501', role: 'OWNER', unit: 501 });
    expect(JSON.stringify(response.body)).not.toContain(refreshCookieOf(response).split('=')[1]);
    const cookie = [response.headers['set-cookie']].flat().join();
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Secure/);
    expect(cookie).toMatch(/SameSite=Strict/);
    expect(cookie).toMatch(/Path=\/api\/auth/);
    expect(response.headers['cache-control']).toBe('no-store');

    const me = await http().get('/api/auth/me').auth(accessToken, { type: 'bearer' }).expect(200);
    expect(currentUserSchema.parse(me.body).username).toBe('501');
  });

  it('rejects wrong credentials with one indistinct error', async () => {
    for (const [username, password] of [
      ['501', 'wrong password'],
      ['999', OWNER_PASSWORD],
      ['502', ''],
    ] as const) {
      const response = await http().post('/api/auth/login').send({ username, password });
      expect([400, 401]).toContain(response.status);
    }
    expectProblem(
      await http().post('/api/auth/login').send({ username: '502', password: 'anything' }),
      401,
      'INVALID_CREDENTIALS',
    );
  });

  it('limits login attempts per IP and username', async () => {
    const attempt = (username: string) =>
      http().post('/api/auth/login').send({ username, password: 'wrong password' });
    for (let i = 0; i < 5; i++) expect((await attempt('501')).status).toBe(401);

    expectProblem(await attempt('501'), 429, 'TOO_MANY_REQUESTS');
    // Another username from the same IP (a neighbour on the same Wi-Fi) is unaffected.
    expect((await attempt('502')).status).toBe(401);
  });

  it('rotates the refresh token, and a reused one ends the session', async () => {
    const { cookie: first } = await login('501', OWNER_PASSWORD);

    const refreshed = await http().post('/api/auth/refresh').set('Cookie', first).expect(200);
    const second = refreshCookieOf(refreshed);
    expect(second).not.toBe(first);
    expect(sessionResponseSchema.parse(refreshed.body).user.username).toBe('501');

    const reuse = await http().post('/api/auth/refresh').set('Cookie', first);
    expectProblem(reuse, 401, 'REFRESH_TOKEN_REUSED');
    expect([reuse.headers['set-cookie']].flat().join()).toMatch(/depadmin_refresh=;/);
    // The legitimate holder of the newer token is signed out too.
    expectProblem(
      await http().post('/api/auth/refresh').set('Cookie', second),
      401,
      'SESSION_INVALID',
    );
  });

  it('signs out: the refresh token stops working', async () => {
    const { cookie } = await login('501', OWNER_PASSWORD);

    const response = await http().post('/api/auth/logout').set('Cookie', cookie).expect(204);
    expect([response.headers['set-cookie']].flat().join()).toMatch(/depadmin_refresh=;/);
    expectProblem(
      await http().post('/api/auth/refresh').set('Cookie', cookie),
      401,
      'SESSION_INVALID',
    );
    await http().post('/api/auth/logout').expect(204);
  });

  it('changes the password, ends the other sessions and keeps this one', async () => {
    const phone = await login('501', OWNER_PASSWORD);
    const laptop = await login('501', OWNER_PASSWORD);

    const changed = await http()
      .post('/api/auth/password')
      .auth(laptop.accessToken, { type: 'bearer' })
      .send({ currentPassword: OWNER_PASSWORD, newPassword: 'una frase nueva y larga' })
      .expect(200);

    expectProblem(
      await http().post('/api/auth/refresh').set('Cookie', phone.cookie),
      401,
      'SESSION_INVALID',
    );
    await http().post('/api/auth/refresh').set('Cookie', refreshCookieOf(changed)).expect(200);
    await login('501', 'una frase nueva y larga');
  });

  it('reports a wrong current password and a too-short new one', async () => {
    const { accessToken } = await login('501', OWNER_PASSWORD);
    const change = (body: object) =>
      http().post('/api/auth/password').auth(accessToken, { type: 'bearer' }).send(body);

    expectProblem(
      await change({ currentPassword: 'wrong', newPassword: 'una frase nueva y larga' }),
      422,
      'CURRENT_PASSWORD_INCORRECT',
    );
    const short = await change({ currentPassword: OWNER_PASSWORD, newPassword: 'corta' });
    expectProblem(short, 400, 'VALIDATION_FAILED');
    expect(problemDetailsSchema.parse(short.body).errors).toEqual([
      expect.objectContaining({ path: 'newPassword' }),
    ]);
  });

  describe('user management', () => {
    it('lets the superadmin list users and hand out a temporary password', async () => {
      const { accessToken } = await login('admin', ADMIN_PASSWORD);

      const list = await http().get('/api/users').auth(accessToken, { type: 'bearer' }).expect(200);
      const users = userListResponseSchema.parse(list.body);
      expect(users.map((u) => [u.username, u.hasPassword])).toEqual([
        ['admin', true],
        ['501', true],
        ['502', false],
      ]);

      const target = users.find((u) => u.username === '502')!;
      const reset = await http()
        .post(`/api/users/${target.id}/password-reset`)
        .auth(accessToken, { type: 'bearer' })
        .expect(200);
      const { temporaryPassword } = passwordResetResponseSchema.parse(reset.body);

      const { session } = await login('502', temporaryPassword);
      expect(session.user.mustChangePassword).toBe(true);
    });

    it('is off limits to owners', async () => {
      const { accessToken } = await login('501', OWNER_PASSWORD);

      expectProblem(
        await http().get('/api/users').auth(accessToken, { type: 'bearer' }),
        403,
        'SUPERADMIN_ONLY',
      );
      expectProblem(
        await http()
          .post(`/api/users/${ownerId}/password-reset`)
          .auth(accessToken, { type: 'bearer' }),
        403,
        'SUPERADMIN_ONLY',
      );
    });

    it('validates the user id and reports unknown users', async () => {
      const { accessToken } = await login('admin', ADMIN_PASSWORD);
      const reset = (id: string) =>
        http().post(`/api/users/${id}/password-reset`).auth(accessToken, { type: 'bearer' });

      expectProblem(await reset('not-a-uuid'), 400, 'VALIDATION_FAILED');
      expectProblem(await reset(randomUUID()), 404, 'USER_NOT_FOUND');
    });
  });
});
