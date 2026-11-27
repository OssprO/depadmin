import {
  accountEmailSchema,
  noticeSchema,
  noticesResponseSchema,
  problemDetailsSchema,
  unsubscribeResponseSchema,
} from '@depadmin/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { PrismaUserRepository } from '../src/modules/identity/infrastructure/prisma-user.repository.js';
import { EmailCourier } from '../src/modules/mail/application/index.js';
import { FakeEmailSender } from '../src/modules/mail/application/testing.js';
import { EMAIL_SENDER } from '../src/modules/mail/domain/index.js';
import { givenAccounts, tokenFor } from './support/accounts.js';
import { useTestApp } from './support/app.js';
import { FixedClock } from './support/clock.js';
import { useTestDatabase } from './support/database.js';

// 27 November 2026: 502 holds October and November.
const ctx = useTestDatabase();
const sender = new FakeEmailSender();
const api = useTestApp({
  clock: FixedClock.on('2026-11-27'),
  providers: [{ provide: EMAIL_SENDER, useValue: sender }],
});
const http = () => request(api.app.getHttpServer());

let admin: string;
let owner502: string;
let owner501: string;

/** A confirmed address, set straight in the database. */
async function givenEmail(username: string, address: string) {
  const users = new PrismaUserRepository(ctx.database);
  const user = (await users.findByUsername(username))!;
  user.confirmEmail(user.requestEmail(address));
  await users.save(user);
}

beforeEach(async () => {
  sender.sent.length = 0;
  await givenAccounts(ctx.database, [501, 502, 401]);
  await givenEmail('admin', 'admin@ejemplo.mx');
  await givenEmail('501', 'admin@ejemplo.mx');
  await givenEmail('401', 'cuatro@ejemplo.mx');
  [admin, owner502, owner501] = await Promise.all([
    tokenFor(api.app, 'admin'),
    tokenFor(api.app, '502'),
    tokenFor(api.app, '501'),
  ]);
});

const expectProblem = (response: request.Response, status: number, code: string) => {
  expect(response.status).toBe(status);
  expect(problemDetailsSchema.parse(response.body).code).toBe(code);
};

async function sent() {
  await api.app.get(EmailCourier).idle();
  return sender.sent;
}

const noticesAs = async (token: string) =>
  noticesResponseSchema.parse(
    (await http().get('/api/notices').auth(token, { type: 'bearer' }).expect(200)).body,
  );

const water = {
  title: 'Corte de agua',
  body: 'El jueves de 9 a 14.\n\nLlenen sus tinacos.',
  expiresOn: '2026-12-03',
};

const publishAs = (token: string, notice: object = water) =>
  http().post('/api/notices').auth(token, { type: 'bearer' }).send(notice);

describe('notices (ADR-0034)', () => {
  it('the shift administrator publishes; everyone reads it, by email too', async () => {
    const published = await publishAs(owner502).expect(201);
    expect(noticeSchema.parse(published.body)).toMatchObject({
      title: 'Corte de agua',
      author: { role: 'OWNER', unit: 502 },
      current: true,
      read: true,
    });

    expect(await noticesAs(owner501)).toMatchObject({
      canPublish: false,
      unread: 1,
      notices: [{ title: 'Corte de agua', expiresOn: '2026-12-03', read: false }],
    });
    expect(await noticesAs(admin)).toMatchObject({ canPublish: true, unread: 1 });
    expect(await noticesAs(owner502)).toMatchObject({ canPublish: true, unread: 0 });

    // One email per address: the administrator's two accounts share one.
    const emails = await sent();
    expect(emails.map(({ to }) => to)).toEqual(['admin@ejemplo.mx', 'cuatro@ejemplo.mx']);
    expect(emails[0]).toMatchObject({ subject: 'Aviso: Corte de agua' });
    expect(emails[0]?.unsubscribe?.oneClick).toMatch(
      /^\/api\/email\/unsubscribe\/[\w-]+\.NOTICES\./,
    );
  });

  it('marks notices read for one account only', async () => {
    const { id } = noticeSchema.parse((await publishAs(admin).expect(201)).body);

    await http()
      .post('/api/notices/read')
      .auth(owner501, { type: 'bearer' })
      .send({ ids: [id] })
      .expect(204);

    expect((await noticesAs(owner501)).unread).toBe(0);
    expect((await noticesAs(owner502)).unread).toBe(1);
  });

  it('lets no other owner publish, and checks what is written', async () => {
    expectProblem(await publishAs(owner501), 403, 'SHIFT_ADMIN_ONLY');
    expectProblem(await publishAs(owner502, { ...water, title: ' ' }), 400, 'VALIDATION_FAILED');
    expectProblem(
      await publishAs(owner502, { ...water, expiresOn: '2026-11-26' }),
      422,
      'NOTICE_EXPIRY_PAST',
    );
    expect((await noticesAs(admin)).notices).toEqual([]);
  });

  it('withdraws a notice for everyone', async () => {
    const { id } = noticeSchema.parse((await publishAs(owner502).expect(201)).body);

    expectProblem(
      await http().delete(`/api/notices/${id}`).auth(owner501, { type: 'bearer' }),
      403,
      'SHIFT_ADMIN_ONLY',
    );
    await http().delete(`/api/notices/${id}`).auth(admin, { type: 'bearer' }).expect(204);

    expect((await noticesAs(owner501)).notices).toEqual([]);
    expectProblem(
      await http().delete(`/api/notices/${id}`).auth(admin, { type: 'bearer' }),
      404,
      'NOTICE_NOT_FOUND',
    );
  });
});

describe('the optional emails (ADR-0034)', () => {
  it('turns notices off in Mi cuenta', async () => {
    const off = await http()
      .put('/api/account/email/topics/NOTICES')
      .auth(owner501, { type: 'bearer' })
      .send({ receive: false })
      .expect(200);
    expect(accountEmailSchema.parse(off.body)).toEqual({
      email: 'admin@ejemplo.mx',
      pendingEmail: null,
      optOuts: ['NOTICES'],
    });

    await publishAs(owner502).expect(201);

    // The superadmin's account still wants them, at the same address.
    expect((await sent()).map(({ to }) => to)).toEqual(['admin@ejemplo.mx', 'cuatro@ejemplo.mx']);
    expectProblem(
      await http()
        .put('/api/account/email/topics/VOTES')
        .auth(owner501, { type: 'bearer' })
        .send({ receive: false }),
      400,
      'VALIDATION_FAILED',
    );
  });

  it('stops them from the link of the email, without a session, for the whole address', async () => {
    await publishAs(owner502).expect(201);
    const link = (await sent())[0]!.unsubscribe!.oneClick;

    const stopped = await http()
      .post(link)
      .type('form')
      .send('List-Unsubscribe=One-Click')
      .expect(200);

    expect(unsubscribeResponseSchema.parse(stopped.body)).toEqual({
      topic: 'NOTICES',
      accounts: ['admin', '501'],
    });
    sender.sent.length = 0;
    await publishAs(owner502, { ...water, title: 'Junta' }).expect(201);
    expect((await sent()).map(({ to }) => to)).toEqual(['cuatro@ejemplo.mx']);
    const ids = await ctx.database.client.user.findMany({
      where: { username: { in: ['admin', '501'] } },
      select: { id: true },
    });
    const audited = await ctx.database.client.auditLog.findMany({
      where: { action: 'USER_UNSUBSCRIBED', entityId: { in: ids.map(({ id }) => id) } },
    });
    expect(audited).toHaveLength(2);
  });

  it('refuses a link changed by hand', async () => {
    await publishAs(owner502).expect(201);
    const link = (await sent())[0]!.unsubscribe!.oneClick;

    expectProblem(await http().post(`${link.slice(0, -2)}xx`), 422, 'UNSUBSCRIBE_LINK_INVALID');
  });
});
