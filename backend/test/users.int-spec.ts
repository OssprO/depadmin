import {
  auditLogPageSchema,
  createReaderResponseSchema,
  monthlyReportSchema,
  problemDetailsSchema,
  sessionResponseSchema,
  userListResponseSchema,
  userSummarySchema,
} from '@depadmin/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { givenAccounts, tokenFor } from './support/accounts.js';
import { useTestApp } from './support/app.js';
import { FixedClock } from './support/clock.js';
import { useTestDatabase } from './support/database.js';

const ctx = useTestDatabase();
const clock = FixedClock.on('2026-10-02');
const api = useTestApp({ clock });
const http = () => request(api.app.getHttpServer());

let admin: string;

beforeEach(async () => {
  await givenAccounts(ctx.database, [501]);
  admin = await tokenFor(api.app, 'admin');
});

const expectProblem = (response: request.Response, status: number, code: string) => {
  expect(response.status).toBe(status);
  expect(problemDetailsSchema.parse(response.body).code).toBe(code);
};

const login = (username: string, password: string) =>
  http().post('/api/auth/login').send({ username, password });

async function createTenant(expiresOn: string | null = '2026-12-31') {
  const response = await http()
    .post('/api/users')
    .auth(admin, { type: 'bearer' })
    .send({ username: 'Inquilino.501', unit: 501, expiresOn })
    .expect(201);
  expect(response.headers['cache-control']).toContain('no-store');
  return createReaderResponseSchema.parse(response.body);
}

describe('users API', () => {
  it('creates a read-only user who sees the books and never writes', async () => {
    const { user, temporaryPassword } = await createTenant();
    expect(user).toMatchObject({
      username: 'inquilino.501',
      role: 'READER',
      unit: 501,
      expiresOn: '2026-12-31',
      disabled: false,
      expired: false,
      mustChangePassword: true,
    });

    const session = sessionResponseSchema.parse(
      (await login('inquilino.501', temporaryPassword).expect(200)).body,
    );
    const reader = session.accessToken;
    const month = monthlyReportSchema.parse(
      (await http().get('/api/months/2026-10').auth(reader, { type: 'bearer' }).expect(200)).body,
    );
    expect(month.canWrite).toBe(false);
    expectProblem(
      await http().post('/api/movements').auth(reader, { type: 'bearer' }).send({
        date: '2026-10-01',
        category: 'UNIT_PAYMENT',
        amount: 70000,
        unit: 501,
        description: null,
        week: null,
      }),
      403,
      'READ_ONLY',
    );
    expectProblem(
      await http().get('/api/users').auth(reader, { type: 'bearer' }),
      403,
      'SUPERADMIN_ONLY',
    );

    const list = userListResponseSchema.parse(
      (await http().get('/api/users').auth(admin, { type: 'bearer' }).expect(200)).body,
    );
    expect(list.map((u) => [u.username, u.role])).toEqual([
      ['admin', 'SUPERADMIN'],
      ['501', 'OWNER'],
      ['inquilino.501', 'READER'],
    ]);
  });

  it("refuses a depto owner's username, a taken one and a past expiry", async () => {
    const create = (body: object) =>
      http()
        .post('/api/users')
        .auth(admin, { type: 'bearer' })
        .send({ unit: null, expiresOn: null, ...body });
    expectProblem(await create({ username: '302' }), 400, 'VALIDATION_FAILED');
    await createTenant();
    expectProblem(await create({ username: 'inquilino.501' }), 409, 'USERNAME_TAKEN');
    expectProblem(
      await create({ username: 'otro', expiresOn: '2026-10-01' }),
      422,
      'USER_EXPIRY_PAST',
    );
  });

  it('changes access, switches users off and on, and logs all of it', async () => {
    const { user, temporaryPassword } = await createTenant();
    const changed = userSummarySchema.parse(
      (
        await http()
          .put(`/api/users/${user.id}/access`)
          .auth(admin, { type: 'bearer' })
          .send({ unit: null, expiresOn: '2027-01-31' })
          .expect(200)
      ).body,
    );
    expect(changed).toMatchObject({ unit: null, expiresOn: '2027-01-31' });

    await http().post(`/api/users/${user.id}/disable`).auth(admin, { type: 'bearer' }).expect(200);
    expectProblem(await login('inquilino.501', temporaryPassword), 401, 'ACCESS_DISABLED');
    await http().post(`/api/users/${user.id}/enable`).auth(admin, { type: 'bearer' }).expect(200);
    await login('inquilino.501', temporaryPassword).expect(200);

    const log = auditLogPageSchema.parse(
      (
        await http()
          .get('/api/audit-log')
          .query({ entity: 'user', entityId: user.id })
          .auth(admin, { type: 'bearer' })
          .expect(200)
      ).body,
    );
    expect(log.entries.map((entry) => entry.action)).toEqual([
      'USER_ENABLED',
      'USER_DISABLED',
      'USER_ACCESS_CHANGED',
      'USER_CREATED',
    ]);
  });

  it("ends a temporary user's access after its last day", async () => {
    const { temporaryPassword } = await createTenant('2026-10-02');
    await login('inquilino.501', temporaryPassword).expect(200);
    clock.advanceDays(1);
    try {
      expectProblem(await login('inquilino.501', temporaryPassword), 401, 'ACCESS_EXPIRED');
      // A day later the superadmin's own access token has expired too.
      const fresh = await tokenFor(api.app, 'admin');
      const list = userListResponseSchema.parse(
        (await http().get('/api/users').auth(fresh, { type: 'bearer' }).expect(200)).body,
      );
      expect(list.find((u) => u.role === 'READER')).toMatchObject({ expired: true });
    } finally {
      clock.advanceDays(-1);
    }
  });
});
