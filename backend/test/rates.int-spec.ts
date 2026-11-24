import { problemDetailsSchema, ratesResponseSchema } from '@depadmin/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { RateSettings } from '../src/modules/settings/domain/index.js';
import { PrismaRateSettingsRepository } from '../src/modules/settings/infrastructure/prisma-rate-settings.repository.js';
import { LocalDate } from '../src/shared-kernel/index.js';
import { givenAccounts, tokenFor } from './support/accounts.js';
import { useTestApp } from './support/app.js';
import { FixedClock } from './support/clock.js';
import { useTestDatabase } from './support/database.js';

const ctx = useTestDatabase();
// 17 November 2026: 502 holds October and November, and November is open.
const NOVEMBER_17 = FixedClock.on('2026-11-17').instant;
const clock = new FixedClock(NOVEMBER_17);
const api = useTestApp({ clock });
const http = () => request(api.app.getHttpServer());

let admin: string;
let owner502: string;
let owner401: string;

beforeEach(async () => {
  clock.instant = NOVEMBER_17;
  await new PrismaRateSettingsRepository(ctx.database).save(
    RateSettings.startingOn(LocalDate.of(2026, 8, 1)),
  );
  await givenAccounts(ctx.database, [502, 401]);
  [admin, owner502, owner401] = await Promise.all([
    tokenFor(api.app, 'admin'),
    tokenFor(api.app, '502'),
    tokenFor(api.app, '401'),
  ]);
  await http()
    .put('/api/reporting-start')
    .auth(admin, { type: 'bearer' })
    .send({ month: '2026-10', openingBalance: 500000 })
    .expect(204);
  await http().post('/api/months/2026-11/open').auth(admin, { type: 'bearer' }).expect(200);
});

const expectProblem = (response: request.Response, status: number, code: string) => {
  expect(response.status).toBe(status);
  expect(problemDetailsSchema.parse(response.body).code).toBe(code);
};

const feeFromDecember = {
  rate: 'maintenanceFee',
  from: '2026-12',
  amount: 80000,
  agreedOn: '2026-11-10',
  agreement: 'Asamblea del 10 de noviembre: la cuota sube a $800',
};

const ratesAs = async (token: string) =>
  ratesResponseSchema.parse(
    (await http().get('/api/rates').auth(token, { type: 'bearer' }).expect(200)).body,
  );

const feesOf = async (month: string) =>
  (
    await ctx.database.client.charge.findMany({
      where: { month: new Date(`${month}-01T00:00:00Z`), type: 'MAINTENANCE_FEE' },
    })
  ).map((charge) => charge.amount);

describe('rates API', () => {
  it('lets the shift administrator change the fee from the next month, which charges it', async () => {
    expect((await ratesAs(owner502)).canChange).toBe(true);
    expect((await ratesAs(admin)).canChange).toBe(false);

    const created = await http()
      .post('/api/rates/changes')
      .auth(owner502, { type: 'bearer' })
      .send(feeFromDecember)
      .expect(201);
    expect(created.body).toEqual({
      effectiveFrom: '2026-12-01',
      amount: 80000,
      agreement: { on: '2026-11-10', summary: feeFromDecember.agreement },
    });
    const fee = (await ratesAs(owner401)).rates[0]!;
    expect(fee).toMatchObject({ rate: 'maintenanceFee', current: 70000, earliestMonth: '2027-01' });
    expect(fee.history.map((change) => [change.amount, change.upcoming])).toEqual([
      [70000, false],
      [80000, true],
    ]);

    clock.instant = FixedClock.on('2026-12-01').instant;
    owner401 = await tokenFor(api.app, '401'); // the earlier token expired meanwhile
    await http().post('/api/months/2026-12/open').auth(owner401, { type: 'bearer' }).expect(200);
    expect(new Set(await feesOf('2026-11'))).toEqual(new Set([70000]));
    expect(new Set(await feesOf('2026-12'))).toEqual(new Set([80000]));

    const audited = await ctx.database.client.auditLog.findMany({
      where: { entity: 'rate_change', entityId: 'maintenanceFee:2026-12-01' },
    });
    expect(audited.map((entry) => [entry.action, entry.actorUnit])).toEqual([
      ['RATE_CHANGE_SCHEDULED', 502],
    ]);
  });

  it('refuses the superadmin, other deptos, an open month and a malformed request', async () => {
    const post = (token: string, body: object = feeFromDecember) =>
      http().post('/api/rates/changes').auth(token, { type: 'bearer' }).send(body);

    expectProblem(await post(admin), 403, 'SHIFT_ADMIN_ONLY');
    expectProblem(await post(owner401), 403, 'SHIFT_ADMIN_ONLY');
    expectProblem(
      await post(owner502, { ...feeFromDecember, from: '2026-11' }),
      409,
      'RATE_CHANGE_TOO_EARLY',
    );
    expectProblem(
      await post(owner502, { ...feeFromDecember, agreement: '' }),
      400,
      'VALIDATION_FAILED',
    );
    expect(await ctx.database.client.rateChange.count()).toBe(4);
  });

  it('takes back a scheduled change', async () => {
    await http()
      .post('/api/rates/changes')
      .auth(owner502, { type: 'bearer' })
      .send({ ...feeFromDecember, rate: 'cleaningPerVisit', amount: 30000 })
      .expect(201);

    expectProblem(
      await http()
        .delete('/api/rates/changes/cleaningPerVisit/2026-12')
        .auth(admin, { type: 'bearer' }),
      403,
      'SHIFT_ADMIN_ONLY',
    );
    await http()
      .delete('/api/rates/changes/cleaningPerVisit/2026-12')
      .auth(owner502, { type: 'bearer' })
      .expect(204);
    expectProblem(
      await http()
        .delete('/api/rates/changes/cleaningPerVisit/2026-12')
        .auth(owner502, { type: 'bearer' }),
      404,
      'RATE_CHANGE_NOT_FOUND',
    );
    expect((await ratesAs(owner502)).rates[1]?.history).toHaveLength(1);
  });
});
