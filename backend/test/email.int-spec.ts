import {
  accountEmailSchema,
  passwordRecoveryAvailabilitySchema,
  problemDetailsSchema,
  recoveryLinkResponseSchema,
  userListResponseSchema,
  userSummarySchema,
} from '@depadmin/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { EmailCourier } from '../src/modules/mail/application/index.js';
import { FakeEmailSender } from '../src/modules/mail/application/testing.js';
import { EMAIL_SENDER } from '../src/modules/mail/domain/index.js';
import { givenAccounts, PASSWORD, tokenFor } from './support/accounts.js';
import { useTestApp } from './support/app.js';
import { FixedClock } from './support/clock.js';
import { useTestDatabase } from './support/database.js';

const ctx = useTestDatabase();
const sender = new FakeEmailSender();
const api = useTestApp({
  clock: FixedClock.on('2026-11-25'),
  providers: [{ provide: EMAIL_SENDER, useValue: sender }],
});
const http = () => request(api.app.getHttpServer());

let owner: string;
let admin: string;

beforeEach(async () => {
  sender.sent.length = 0;
  sender.configured = true;
  await givenAccounts(ctx.database, [501, 502]);
  owner = await tokenFor(api.app, '501');
  admin = await tokenFor(api.app, 'admin');
});

/** What the courier sent, once it is done. */
async function sent() {
  await api.app.get(EmailCourier).idle();
  return sender.sent;
}

/** The secret after the `#` of the last link sent to `to`. */
async function linkSentTo(to: string): Promise<string> {
  const email = (await sent()).findLast((message) => message.to === to && message.action);
  return email!.action!.path.split('#')[1]!;
}

const expectProblem = (response: request.Response, status: number, code: string) => {
  expect(response.status).toBe(status);
  expect(problemDetailsSchema.parse(response.body).code).toBe(code);
};

async function confirmedEmail(token: string, email: string) {
  await http()
    .put('/api/account/email')
    .auth(token, { type: 'bearer' })
    .send({ email })
    .expect(200);
  await http()
    .post('/api/account/email/confirm')
    .auth(token, { type: 'bearer' })
    .send({ token: await linkSentTo(email) })
    .expect(200);
}

describe('email in Mi cuenta', () => {
  it('captures an address, sends its link and confirms it with the account signed in', async () => {
    const captured = await http()
      .put('/api/account/email')
      .auth(owner, { type: 'bearer' })
      .send({ email: ' Vecina.501@Ejemplo.MX ' })
      .expect(200);
    expect(accountEmailSchema.parse(captured.body)).toEqual({
      email: null,
      pendingEmail: 'vecina.501@ejemplo.mx',
    });
    const [confirmation] = await sent();
    expect(confirmation).toMatchObject({
      to: 'vecina.501@ejemplo.mx',
      subject: 'Confirma tu correo en DepAdmin',
    });

    const link = await linkSentTo('vecina.501@ejemplo.mx');
    const other = await http()
      .post('/api/account/email/confirm')
      .auth(admin, { type: 'bearer' })
      .send({ token: link });
    expectProblem(other, 403, 'EMAIL_LINK_OTHER_ACCOUNT');

    const confirmed = await http()
      .post('/api/account/email/confirm')
      .auth(owner, { type: 'bearer' })
      .send({ token: link })
      .expect(200);
    expect(confirmed.body).toEqual({ email: 'vecina.501@ejemplo.mx', pendingEmail: null });
    const current = await http()
      .get('/api/account/email')
      .auth(owner, { type: 'bearer' })
      .expect(200);
    expect(current.body).toEqual(confirmed.body);
  });

  it('keeps no address in the audit log, and no link in the outbox once sent', async () => {
    await confirmedEmail(owner, 'vecina@ejemplo.mx');

    const entries = await ctx.database.client.auditLog.findMany({
      where: { action: { startsWith: 'USER_EMAIL_' } },
    });
    expect(entries.map((entry) => entry.action)).toEqual(
      expect.arrayContaining(['USER_EMAIL_REQUESTED', 'USER_EMAIL_CONFIRMED']),
    );
    expect(JSON.stringify(entries.map((entry) => entry.changes))).not.toContain('vecina@');
    const outbox = await ctx.database.client.emailOutbox.findMany();
    expect(outbox).toMatchObject([{ status: 'SENT', paragraphs: [], actionPath: null }]);
  });

  it('refuses a fourth link in an hour and an address that is not one', async () => {
    for (const email of ['a@ejemplo.mx', 'b@ejemplo.mx', 'c@ejemplo.mx']) {
      await http()
        .put('/api/account/email')
        .auth(owner, { type: 'bearer' })
        .send({ email })
        .expect(200);
    }
    const fourth = await http()
      .put('/api/account/email')
      .auth(owner, { type: 'bearer' })
      .send({ email: 'd@ejemplo.mx' });
    expectProblem(fourth, 409, 'EMAIL_CONFIRMATION_LIMIT');

    const invalid = await http()
      .put('/api/account/email')
      .auth(owner, { type: 'bearer' })
      .send({ email: 'no-es-correo' });
    expectProblem(invalid, 400, 'VALIDATION_FAILED');
  });

  it('removes it', async () => {
    await confirmedEmail(owner, 'vecina@ejemplo.mx');
    const removed = await http()
      .delete('/api/account/email')
      .auth(owner, { type: 'bearer' })
      .expect(200);
    expect(removed.body).toEqual({ email: null, pendingEmail: null });
  });
});

describe('email in Usuarios', () => {
  it('lets the superadmin capture and remove anyone’s, and shows it in the list', async () => {
    const users = userListResponseSchema.parse(
      (await http().get('/api/users').auth(admin, { type: 'bearer' }).expect(200)).body,
    );
    const id = users.find((user) => user.username === '502')!.id;

    const captured = await http()
      .put(`/api/users/${id}/email`)
      .auth(admin, { type: 'bearer' })
      .send({ email: 'vecino.502@ejemplo.mx' })
      .expect(200);
    expect(userSummarySchema.parse(captured.body)).toMatchObject({
      username: '502',
      email: null,
      pendingEmail: 'vecino.502@ejemplo.mx',
    });
    expect((await sent()).map((email) => email.to)).toEqual(['vecino.502@ejemplo.mx']);

    const byOwner = await http()
      .put(`/api/users/${id}/email`)
      .auth(owner, { type: 'bearer' })
      .send({ email: 'otro@ejemplo.mx' });
    expectProblem(byOwner, 403, 'SUPERADMIN_ONLY');

    const removed = await http()
      .put(`/api/users/${id}/email`)
      .auth(admin, { type: 'bearer' })
      .send({ email: null })
      .expect(200);
    expect(removed.body).toMatchObject({ email: null, pendingEmail: null });
  });
});

describe('password recovery', () => {
  const ask = (username: string) => http().post('/api/auth/password-recovery').send({ username });

  it('is offered only while emails go out', async () => {
    const available = await http().get('/api/auth/password-recovery').expect(200);
    expect(passwordRecoveryAvailabilitySchema.parse(available.body)).toEqual({ available: true });

    sender.configured = false;
    expect((await http().get('/api/auth/password-recovery')).body).toEqual({ available: false });
  });

  it('answers the same whether the user exists, has an email or not', async () => {
    await confirmedEmail(owner, 'vecina@ejemplo.mx');
    sender.sent.length = 0;

    const answers = [await ask('501'), await ask('502'), await ask('nadie')];

    for (const answer of answers) {
      expect(answer.status).toBe(202);
      expect(answer.body).toEqual({});
    }
    expect((await sent()).map((email) => email.to)).toEqual(['vecina@ejemplo.mx']);
  });

  it('sets a new password from the link, ends every session and tells the email', async () => {
    await confirmedEmail(owner, 'vecina@ejemplo.mx');
    const login = await http()
      .post('/api/auth/login')
      .send({ username: '501', password: PASSWORD })
      .expect(200);
    const cookie = login.headers['set-cookie'];
    await ask('501').expect(202);
    const token = await linkSentTo('vecina@ejemplo.mx');

    const check = await http()
      .post('/api/auth/password-recovery/check')
      .send({ token })
      .expect(200);
    expect(check.headers['cache-control']).toContain('no-store');
    expect(recoveryLinkResponseSchema.parse(check.body)).toEqual({ username: '501' });
    await http()
      .post('/api/auth/password-recovery/complete')
      .send({ token, newPassword: 'la casa del 501' })
      .expect(204);

    await http().post('/api/auth/refresh').set('Cookie', cookie!).expect(401);
    await http()
      .post('/api/auth/login')
      .send({ username: '501', password: 'la casa del 501' })
      .expect(200);
    expect((await sent()).at(-1)).toMatchObject({
      to: 'vecina@ejemplo.mx',
      subject: 'Tu contraseña de DepAdmin cambió',
    });
    const again = await http()
      .post('/api/auth/password-recovery/complete')
      .send({ token, newPassword: 'otra frase larga' });
    expectProblem(again, 409, 'RECOVERY_LINK_INVALID');
  });

  it('asks a recovered password the same length as any other', async () => {
    const short = await http()
      .post('/api/auth/password-recovery/complete')
      .send({ token: 'x', newPassword: 'corta' });
    expectProblem(short, 400, 'VALIDATION_FAILED');
  });

  it('takes 5 requests an hour from one IP, whatever the usernames', async () => {
    for (const username of ['a', 'b', 'c', 'd', 'e']) await ask(username).expect(202);
    expectProblem(await ask('f'), 429, 'TOO_MANY_REQUESTS');
  });
});
