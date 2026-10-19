import { problemDetailsSchema } from '@depadmin/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { RateSettings } from '../src/modules/settings/domain/index.js';
import { PrismaRateSettingsRepository } from '../src/modules/settings/infrastructure/prisma-rate-settings.repository.js';
import { AddMovement } from '../src/modules/cashbook/application/index.js';
import {
  type Actor,
  LocalDate,
  Money,
  UNIT_OF_WORK,
  UnitNumber,
  type UnitOfWork,
} from '../src/shared-kernel/index.js';
import { givenAccounts, tokenFor } from './support/accounts.js';
import { useTestApp } from './support/app.js';
import { FixedClock } from './support/clock.js';
import { useTestDatabase } from './support/database.js';

// Requests that race each other. The domain checks run first in every request, so two of
// them can pass at once; the database (constraints and row locks) has the last word, and
// the loser must get the same answer as if it had come second.

const ctx = useTestDatabase();
const api = useTestApp({ clock: FixedClock.on('2026-10-02') });
const http = () => request(api.app.getHttpServer());
let admin: string;
const superadmin: Actor = { role: 'SUPERADMIN', userId: 'race-test' };

beforeEach(async () => {
  await new PrismaRateSettingsRepository(ctx.database).save(
    RateSettings.startingOn(LocalDate.of(2026, 8, 1)),
  );
  await givenAccounts(ctx.database, [501]);
  admin = await tokenFor(api.app, 'admin');
  await http()
    .put('/api/reporting-start')
    .auth(admin, { type: 'bearer' })
    .send({ month: '2026-09', openingBalance: 500000 })
    .expect(204);
  await http().post('/api/months/2026-10/open').auth(admin, { type: 'bearer' }).expect(200);
});

const statuses = (responses: request.Response[]) => responses.map((r) => r.status).sort();
const codeOf = (responses: request.Response[], status: number) =>
  problemDetailsSchema.parse(responses.find((r) => r.status === status)?.body).code;

describe('concurrent requests', () => {
  it('pays a garbage week once when several confirmations race', async () => {
    const confirm = () =>
      http().post('/api/movements').auth(admin, { type: 'bearer' }).send({
        date: '2026-10-01',
        category: 'GARBAGE',
        amount: 15000,
        unit: null,
        description: null,
        week: '2026-09-28',
      });

    // Enough of them that two often deadlock on the exclusion constraint: the one Postgres
    // aborts runs again and gets the same 409 as the rest.
    const responses = await Promise.all(Array.from({ length: 6 }, confirm));

    expect(statuses(responses)).toEqual([201, 409, 409, 409, 409, 409]);
    expect(codeOf(responses, 409)).toBe('GARBAGE_WEEK_PAID');
    expect(await ctx.database.client.cashMovement.count()).toBe(1);
  });

  it('delegates the same months once when two delegations race', async () => {
    const delegate = (delegateUnit: number) =>
      http()
        .post('/api/shifts/delegations')
        .auth(admin, { type: 'bearer' })
        .send({ from: '2026-12', to: '2027-01', delegateUnit, reason: 'OTHER' });

    const responses = await Promise.all([delegate(402), delegate(301)]);

    expect(statuses(responses)).toEqual([201, 409]);
    expect(codeOf(responses, 409)).toBe('DELEGATIONS_OVERLAP');
  });

  it('closes the month only after a row being written commits, and counts it', async () => {
    const unitOfWork = api.app.get<UnitOfWork>(UNIT_OF_WORK);
    const add = api.app.get(AddMovement);
    let release = () => {};
    let written = () => {};
    const isWritten = new Promise<void>((resolve) => (written = resolve));
    // A $700 payment to September whose transaction has not committed yet.
    const writing = unitOfWork.run(async () => {
      await add.execute(superadmin, {
        date: LocalDate.of(2026, 9, 30),
        category: 'UNIT_PAYMENT',
        amount: Money.ofPesos(700),
        unit: UnitNumber.of(501),
        description: null,
        week: null,
      });
      written();
      await new Promise<void>((resolve) => (release = resolve));
    });
    await isWritten;

    const closing = http().post('/api/months/2026-09/close').auth(admin, { type: 'bearer' });
    const early = await Promise.race([
      closing.then(() => 'closed'),
      new Promise((resolve) => setTimeout(() => resolve('waiting'), 500)),
    ]);
    expect(early).toBe('waiting');

    release();
    await writing;
    expect((await closing).status).toBe(204);
    const september = await ctx.database.client.monthlyReport.findFirst({
      where: { month: new Date('2026-09-01') },
    });
    expect(september?.closingBalance).toBe(570000);
  });
});
