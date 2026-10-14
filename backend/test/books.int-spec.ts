import {
  accountListResponseSchema,
  accountStatementSchema,
  auditLogPageSchema,
  monthHistorySchema,
  monthlyReportSchema,
  openMonthResponseSchema,
  problemDetailsSchema,
} from '@depadmin/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { OpenCurrentMonth } from '../src/modules/reports/application/index.js';
import { RateSettings } from '../src/modules/settings/domain/index.js';
import { PrismaRateSettingsRepository } from '../src/modules/settings/infrastructure/prisma-rate-settings.repository.js';
import { LocalDate } from '../src/shared-kernel/index.js';
import { givenAccounts, tokenFor } from './support/accounts.js';
import { useTestApp } from './support/app.js';
import { FixedClock } from './support/clock.js';
import { useTestDatabase } from './support/database.js';

const ctx = useTestDatabase();
// 2 October 2026: 502 holds October; 501 can still square September.
const api = useTestApp({ clock: FixedClock.on('2026-10-02') });
const http = () => request(api.app.getHttpServer());

let admin: string;
let owner501: string;
let owner502: string;

beforeEach(async () => {
  await new PrismaRateSettingsRepository(ctx.database).save(
    RateSettings.startingOn(LocalDate.of(2026, 8, 1)),
  );
  await givenAccounts(ctx.database, [401, 501, 502]);
  [admin, owner501, owner502] = await Promise.all([
    tokenFor(api.app, 'admin'),
    tokenFor(api.app, '501'),
    tokenFor(api.app, '502'),
  ]);
});

const expectProblem = (response: request.Response, status: number, code: string) => {
  expect(response.status).toBe(status);
  expect(problemDetailsSchema.parse(response.body).code).toBe(code);
};

const month = async (token: string, value: string) =>
  monthlyReportSchema.parse(
    (await http().get(`/api/months/${value}`).auth(token, { type: 'bearer' }).expect(200)).body,
  );

async function startBooks() {
  await http()
    .put('/api/reporting-start')
    .auth(admin, { type: 'bearer' })
    .send({ month: '2026-08', openingBalance: 500000 })
    .expect(204);
}

const addRow = (token: string, body: object) =>
  http()
    .post('/api/movements')
    .auth(token, { type: 'bearer' })
    .send({ unit: null, description: null, week: null, ...body });

describe('books API', () => {
  it('starts the books, opens the month and keeps a live report', async () => {
    expect(await month(owner502, '2026-10')).toMatchObject({
      reportingStarted: false,
      canOpen: false,
    });
    expectProblem(
      await http()
        .put('/api/reporting-start')
        .auth(owner502, { type: 'bearer' })
        .send({ month: '2026-08', openingBalance: 500000 }),
      403,
      'SUPERADMIN_ONLY',
    );
    await startBooks();
    expect((await month(owner502, '2026-10')).canOpen).toBe(true);

    const opened = openMonthResponseSchema.parse(
      (await http().post('/api/months/2026-10/open').auth(owner502, { type: 'bearer' }).expect(200))
        .body,
    );
    expect(opened.opened).toEqual(['2026-08', '2026-09', '2026-10']);
    expect(await ctx.database.client.charge.count()).toBe(30);

    await addRow(owner502, {
      date: '2026-10-02',
      category: 'UNIT_PAYMENT',
      amount: 105000,
      unit: 401,
    }).expect(201);
    const cleaning = await addRow(owner502, {
      date: '2026-10-02',
      category: 'CLEANING',
      amount: 27000,
    }).expect(201);

    const october = await month(owner502, '2026-10');
    expect(october).toMatchObject({
      status: 'OPEN',
      canWrite: true,
      balances: { opening: 500000, closing: 578000 },
      totals: { income: 105000, expense: 27000 },
      suggestions: { maintenanceFee: 70000, cleaningPerVisit: 27000, garbageWeekly: 15000 },
    });
    // 401 owed August, September and October: the payment covers August and half of September.
    expect(october.movements[0]?.coverage).toEqual([
      { month: '2026-08', type: 'MAINTENANCE_FEE', amount: 70000, settles: true },
      { month: '2026-09', type: 'MAINTENANCE_FEE', amount: 35000, settles: false },
    ]);

    const { id } = cleaning.body as { id: string };
    await http()
      .put(`/api/movements/${id}`)
      .auth(owner502, { type: 'bearer' })
      .send({
        date: '2026-10-02',
        category: 'CLEANING',
        amount: 30000,
        unit: null,
        description: null,
        week: null,
      })
      .expect(204);
    await http().delete(`/api/movements/${id}`).auth(owner502, { type: 'bearer' }).expect(204);
    expect((await month(owner502, '2026-10')).balances?.closing).toBe(605000);

    const log = auditLogPageSchema.parse(
      (
        await http()
          .get('/api/audit-log')
          .query({ entity: 'cash_movement', entityId: id })
          .auth(owner502, { type: 'bearer' })
      ).body,
    );
    expect(log.entries.map((e) => e.action)).toEqual([
      'CASH_MOVEMENT_REMOVED',
      'CASH_MOVEMENT_REVISED',
      'CASH_MOVEMENT_ADDED',
    ]);
  });

  it('keeps each account from the charges and the payments', async () => {
    await startBooks();
    await http().post('/api/months/2026-09/open').auth(admin, { type: 'bearer' }).expect(200);
    await addRow(admin, {
      date: '2026-09-10',
      category: 'UNIT_PAYMENT',
      amount: 210000,
      unit: 101,
    }).expect(201);

    const accounts = accountListResponseSchema.parse(
      (await http().get('/api/accounts').auth(owner502, { type: 'bearer' }).expect(200)).body,
    );
    expect(accounts.find((a) => a.unit === 101)).toEqual({
      unit: 101,
      outstanding: 0,
      credit: 70000,
    });
    expect(accounts.find((a) => a.unit === 102)).toEqual({
      unit: 102,
      outstanding: 140000,
      credit: 0,
    });
    const statement = accountStatementSchema.parse(
      (await http().get('/api/accounts/102').auth(owner502, { type: 'bearer' }).expect(200)).body,
    );
    expect(statement.lines.map((l) => [l.month, l.status])).toEqual([
      ['2026-08', 'UNPAID'],
      ['2026-09', 'UNPAID'],
    ]);
    expectProblem(
      await http().get('/api/accounts/503').auth(admin, { type: 'bearer' }),
      400,
      'VALIDATION_FAILED',
    );
  });

  it('refuses rows outside the rules', async () => {
    await startBooks();
    await http().post('/api/months/2026-10/open').auth(admin, { type: 'bearer' }).expect(200);
    const owner401 = await tokenFor(api.app, '401');
    const payment = { date: '2026-10-02', category: 'UNIT_PAYMENT', amount: 70000, unit: 401 };

    expectProblem(await addRow(owner502, { ...payment, unit: null }), 400, 'VALIDATION_FAILED');
    expectProblem(await addRow(owner401, payment), 403, 'NOT_RESPONSIBLE');
    expectProblem(
      await addRow(owner502, { ...payment, date: '2026-11-02' }),
      403,
      'OUTSIDE_WRITE_WINDOW',
    );
    expectProblem(await addRow(admin, { ...payment, date: '2026-11-02' }), 409, 'MONTH_NOT_OPENED');
    expectProblem(
      await http().post('/api/months/2026-11/open').auth(admin, { type: 'bearer' }),
      409,
      'MONTH_NOT_STARTED',
    );
    // A depto's status can no longer change in a month whose fees are charged.
    expectProblem(
      await http()
        .post('/api/units/302/status')
        .auth(admin, { type: 'bearer' })
        .send({ active: false, from: '2026-10' }),
      409,
      'UNIT_STATUS_MONTH_OPENED',
    );
  });

  it('confirms a pending garbage week and marks several cleaning visits', async () => {
    await startBooks();
    await http().post('/api/months/2026-10/open').auth(admin, { type: 'bearer' }).expect(200);

    const [first] = (await month(owner502, '2026-10')).garbageWeeks;
    expect(first).toEqual({
      week: '2026-09-28',
      payday: '2026-10-03',
      status: 'PENDING',
      paidBy: null,
      suggestedDate: '2026-10-02',
    });
    const garbage = {
      date: first!.suggestedDate,
      category: 'GARBAGE',
      amount: 15000,
      week: first!.week,
    };
    const paid = await addRow(owner502, garbage).expect(201);
    expectProblem(await addRow(owner502, garbage), 409, 'GARBAGE_WEEK_PAID');
    expectProblem(
      await addRow(owner502, { ...garbage, week: '2026-10-04' }),
      400,
      'VALIDATION_FAILED',
    );

    const visits = (dates: string[]) =>
      http()
        .post('/api/movements/cleaning-visits')
        .auth(owner502, { type: 'bearer' })
        .send({ dates, amount: 27000 });
    const recorded = await visits(['2026-10-01', '2026-10-02']).expect(201);
    expect((recorded.body as { ids: string[] }).ids).toHaveLength(2);
    expectProblem(await visits(['2026-10-02']), 409, 'CLEANING_VISIT_RECORDED');

    const october = await month(owner502, '2026-10');
    expect(october.garbageWeeks[0]).toMatchObject({
      status: 'PAID',
      paidBy: { id: (paid.body as { id: string }).id, date: '2026-10-02' },
    });
    expect(october.movements.find((row) => row.category === 'GARBAGE')?.week).toBe('2026-09-28');
    expect(october.cleaningPayouts).toEqual([
      { weekStart: '2026-09-28', dates: ['2026-10-01', '2026-10-02'], total: 54000 },
    ]);
    expect(october.totals.expense).toBe(69000);
  });

  it('closes the outgoing owner’s months, lists them and lets the superadmin reopen one', async () => {
    await startBooks();
    await http().post('/api/months/2026-10/open').auth(admin, { type: 'bearer' }).expect(200);
    await addRow(owner501, {
      date: '2026-09-05',
      category: 'UNIT_PAYMENT',
      amount: 70000,
      unit: 401,
    }).expect(201);
    const close = (token: string, value: string) =>
      http().post(`/api/months/${value}/close`).auth(token, { type: 'bearer' });

    expectProblem(await close(owner501, '2026-09'), 409, 'PREVIOUS_MONTH_OPEN');
    expectProblem(await close(owner502, '2026-08'), 403, 'NOT_RESPONSIBLE');
    expectProblem(await close(admin, '2026-10'), 409, 'MONTH_IN_PROGRESS');
    expect((await month(owner501, '2026-08')).canClose).toBe(true);
    await close(owner501, '2026-08').expect(204);
    await close(owner501, '2026-09').expect(204);

    const history = monthHistorySchema.parse(
      (await http().get('/api/months').auth(owner502, { type: 'bearer' }).expect(200)).body,
    );
    expect(history.months.map((e) => [e.month, e.status, e.closingBalance])).toEqual([
      ['2026-10', 'OPEN', 570000],
      ['2026-09', 'CLOSED', 570000],
      ['2026-08', 'CLOSED', 500000],
    ]);
    const stored = await ctx.database.client.monthlyReport.findMany({ orderBy: { month: 'asc' } });
    expect(stored.map((row) => [row.closingBalance, row.closedAt !== null])).toEqual([
      [500000, true],
      [570000, true],
      [null, false],
    ]);
    expectProblem(
      await addRow(owner501, {
        date: '2026-09-06',
        category: 'UNIT_PAYMENT',
        amount: 70000,
        unit: 402,
      }),
      409,
      'MONTH_CLOSED',
    );

    const reopen = (token: string, value: string) =>
      http().post(`/api/months/${value}/reopen`).auth(token, { type: 'bearer' });
    expectProblem(await reopen(owner501, '2026-09'), 403, 'SUPERADMIN_ONLY');
    await reopen(admin, '2026-09').expect(204);
    expect(await month(owner501, '2026-09')).toMatchObject({ status: 'OPEN', canWrite: true });

    const log = auditLogPageSchema.parse(
      (
        await http()
          .get('/api/audit-log?entity=monthly_report&entityId=2026-09')
          .auth(admin, { type: 'bearer' })
          .expect(200)
      ).body,
    );
    // The log is never truncated: other tests opened September too, earlier.
    expect(log.entries.slice(0, 3).map((entry) => [entry.action, entry.actor])).toEqual([
      ['MONTH_REOPENED', { role: 'SUPERADMIN', unit: null }],
      ['MONTH_CLOSED', { role: 'OWNER', unit: 501 }],
      ['MONTH_OPENED', { role: 'SUPERADMIN', unit: null }],
    ]);
  });

  it('opens the month as the system when nobody did, and logs it as such', async () => {
    await startBooks();

    const opened = await api.app.get(OpenCurrentMonth).execute();

    expect(opened.map((report) => String(report.month))).toEqual(['2026-08', '2026-09', '2026-10']);
    const log = auditLogPageSchema.parse(
      (
        await http()
          .get('/api/audit-log?actor=system&entity=monthly_report')
          .auth(owner502, { type: 'bearer' })
          .expect(200)
      ).body,
    );
    expect(log.entries.map((entry) => [entry.entityId, entry.actor])).toEqual([
      ['2026-10', { role: 'SYSTEM', unit: null }],
      ['2026-09', { role: 'SYSTEM', unit: null }],
      ['2026-08', { role: 'SYSTEM', unit: null }],
    ]);
    expect((await month(owner502, '2026-10')).status).toBe('OPEN');
  });

  it('downloads the month’s report as a PDF, for any opened month', async () => {
    await startBooks();
    await http().post('/api/months/2026-10/open').auth(admin, { type: 'bearer' }).expect(200);
    const pdf = (token: string, value: string) =>
      http()
        .get(`/api/months/${value}/report.pdf`)
        .auth(token, { type: 'bearer' })
        .buffer(true)
        .parse((response, done) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () => done(null, Buffer.concat(chunks)));
        });

    const response = await pdf(owner502, '2026-09').expect(200);

    expect(response.headers['content-type']).toBe('application/pdf');
    expect(response.headers['content-disposition']).toBe(
      'attachment; filename="reporte-2026-09.pdf"',
    );
    expect((response.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    expectProblem(
      await http().get('/api/months/2026-11/report.pdf').auth(owner502, { type: 'bearer' }),
      404,
      'REPORT_NOT_FOUND',
    );
  });
});
