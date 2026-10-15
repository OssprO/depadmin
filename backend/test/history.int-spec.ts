import {
  auditLogPageSchema,
  type HistoryFile,
  historyPreviewSchema,
  historyStateSchema,
  monthlyReportSchema,
  paperMonthSchema,
  problemDetailsSchema,
  reportingStartResponseSchema,
  unitSchema,
} from '@depadmin/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { LocalDate } from '../src/shared-kernel/index.js';
import { RateSettings } from '../src/modules/settings/domain/index.js';
import { PrismaRateSettingsRepository } from '../src/modules/settings/infrastructure/prisma-rate-settings.repository.js';
import { givenAccounts, tokenFor } from './support/accounts.js';
import { useTestApp } from './support/app.js';
import { FixedClock } from './support/clock.js';
import { useTestDatabase } from './support/database.js';

const ctx = useTestDatabase();
const api = useTestApp({ clock: FixedClock.on('2026-10-02') });
const http = () => request(api.app.getHttpServer());

let admin: string;
let owner501: string;

beforeEach(async () => {
  // As the seed leaves them: the import adds the history's rates before these.
  await new PrismaRateSettingsRepository(ctx.database).save(
    RateSettings.startingOn(LocalDate.of(2026, 8, 1)),
  );
  await givenAccounts(api.database, [501]);
  [admin, owner501] = await Promise.all([tokenFor(api.app, 'admin'), tokenFor(api.app, '501')]);
});

const expectProblem = (response: request.Response, status: number, code: string) => {
  expect(response.status).toBe(status);
  expect(problemDetailsSchema.parse(response.body).code).toBe(code);
};

const cleaning = (date: string) => ({
  date,
  category: 'CLEANING' as const,
  amount: 20000,
  unit: null,
  description: 'VISITA DE LIMPIEZA',
  week: null,
});

/**
 * Three years of made-up history, with a cleaning visit nearly every day so the file weighs
 * more than the 100 KB Express accepts by default (the real one is about 200 KB).
 */
function file(): HistoryFile {
  const months: HistoryFile['months'] = Array.from({ length: 36 }, (_, i) => {
    const month = `${2022 + Math.floor((i + 4) / 12)}-${String(((i + 4) % 12) + 1).padStart(2, '0')}`;
    return {
      month,
      sheets: [],
      movements: Array.from({ length: 28 }, (_, day) =>
        cleaning(`${month}-${String(day + 1).padStart(2, '0')}`),
      ),
    };
  });
  months[0]!.sheets = [
    {
      fromDay: 1,
      source: 'PDF MAY-JUL 2022 p1',
      opening: 71225,
      income: 60000,
      expense: 15000,
      closing: 116225,
      alerts: ['Cuota de $600 más $100 de administración'],
      lines: [
        { unit: 301, ownerName: null, current: null, other: null, text: 'PAGÓ EN JULIO 2022' },
      ],
    },
  ];
  months[0]!.movements = [
    {
      date: '2022-05-01',
      category: 'UNIT_PAYMENT',
      amount: 60000,
      unit: 101,
      description: null,
      week: null,
    },
    {
      date: '2022-05-14',
      category: 'GARBAGE',
      amount: 15000,
      unit: null,
      description: null,
      week: '2022-05-09',
    },
  ];
  return {
    version: 2,
    openingBalance: 71225,
    months,
    owners: [{ unit: 101, name: 'NOMBRE DE PRUEBA' }],
    rates: (
      ['maintenanceFee', 'cleaningPerVisit', 'garbageWeekly', 'shiftSkipPenalty'] as const
    ).map((rate) => ({ rate, effectiveFrom: '2022-05-01', amount: 20000 })),
  };
}

const state = async () =>
  historyStateSchema.parse(
    (await http().get('/api/history').auth(admin, { type: 'bearer' }).expect(200)).body,
  ).history;

const paperMonth = async (value: string, token = admin) =>
  paperMonthSchema.parse(
    (await http().get(`/api/history/months/${value}`).auth(token, { type: 'bearer' }).expect(200))
      .body,
  );

const book = async (value: string) =>
  monthlyReportSchema.parse(
    (await http().get(`/api/months/${value}`).auth(admin, { type: 'bearer' }).expect(200)).body,
  );

/** The audit log is never truncated, so a spec reads only what it wrote after `newestId`. */
const auditActionsSince = async (newestId: string | null) => {
  const log = auditLogPageSchema.parse(
    (await http().get('/api/audit-log').auth(admin, { type: 'bearer' }).expect(200)).body,
  );
  const end = log.entries.findIndex((entry) => entry.id === newestId);
  return log.entries.slice(0, end === -1 ? undefined : end).map((entry) => entry.action);
};

const newestAuditId = async () =>
  auditLogPageSchema.parse(
    (await http().get('/api/audit-log?limit=1').auth(admin, { type: 'bearer' }).expect(200)).body,
  ).entries[0]?.id ?? null;

const imported = () =>
  http().post('/api/history').auth(admin, { type: 'bearer' }).send(file()).expect(204);

const sheetBody = {
  fromDay: 1,
  source: 'foto nueva',
  opening: null,
  income: null,
  expense: null,
  closing: null,
  alerts: [],
  lines: [],
};

describe('history API', () => {
  it('starts the books with a file larger than the default body limit, outside the audit log', async () => {
    const body = file();
    expect(JSON.stringify(body).length).toBeGreaterThan(100_000);

    const preview = historyPreviewSchema.parse(
      (
        await http()
          .post('/api/history/preview')
          .auth(admin, { type: 'bearer' })
          .send(body)
          .expect(200)
      ).body,
    );
    expect(preview).toMatchObject({
      firstMonth: '2022-05',
      lastMonth: '2025-04',
      cutover: '2025-05',
      movements: 36 * 28 + 2 - 28,
    });
    expect(preview.months[0]).toMatchObject({ closing: 116225, ownGap: 0, carriedGap: 0 });
    expect(await state()).toBeNull();

    const before = await newestAuditId();
    await http().post('/api/history').auth(admin, { type: 'bearer' }).send(body).expect(204);
    expect((await state())!.months).toHaveLength(36);
    expect(
      reportingStartResponseSchema.parse(
        (await http().get('/api/reporting-start').auth(admin, { type: 'bearer' }).expect(200)).body,
      ).start,
    ).toEqual({ month: '2022-05', openingBalance: 71225, cutover: '2025-05' });

    const may = await book('2022-05');
    expect(may).toMatchObject({ status: 'OPEN', historical: true, canWrite: true });
    expect(may.movements.map((row) => row.category)).toEqual(['UNIT_PAYMENT', 'GARBAGE']);
    expect(may.suggestions?.cleaningPerVisit).toBe(20000);
    const paper = await paperMonth('2022-05', owner501);
    expect(paper).toMatchObject({ canEdit: false, paperIncome: 60000, paperExpense: 15000 });
    expect(paper.sheets[0]!.lines[0]).toMatchObject({ unit: 301, text: 'PAGÓ EN JULIO 2022' });

    const units = unitSchema
      .array()
      .parse((await http().get('/api/units').auth(admin, { type: 'bearer' }).expect(200)).body);
    expect(units.find((unit) => unit.number === 101)!.ownerName).toBe('NOMBRE DE PRUEBA');

    // Only the owner's name, which is current data, went to the audit log.
    expect(await auditActionsSince(before)).toEqual(['UNIT_OWNER_RENAMED']);

    expectProblem(
      await http().post('/api/history').auth(admin, { type: 'bearer' }).send(body),
      409,
      'BOOKS_ALREADY_STARTED',
    );
  });

  it('is imported and reviewed by the superadmin only', async () => {
    expectProblem(
      await http().get('/api/history').auth(owner501, { type: 'bearer' }),
      403,
      'SUPERADMIN_ONLY',
    );
    expectProblem(
      await http().post('/api/history').auth(owner501, { type: 'bearer' }).send(file()),
      403,
      'SUPERADMIN_ONLY',
    );
  });

  it('refuses a file that breaks the contract', async () => {
    const response = await http()
      .post('/api/history/preview')
      .auth(admin, { type: 'bearer' })
      .send({ ...file(), version: 1 });
    expectProblem(response, 400, 'VALIDATION_FAILED');
  });

  it('corrects its rows through the cashbook and its sheets, all outside the audit log', async () => {
    await imported();
    const before = await newestAuditId();

    const added = await http()
      .post('/api/movements')
      .auth(admin, { type: 'bearer' })
      .send({
        date: '2022-06-30',
        category: 'OTHER_EXPENSE',
        amount: 51100,
        unit: null,
        description: 'LUZ',
        week: null,
      })
      .expect(201);
    const id = (added.body as { id: string }).id;
    expect((await book('2022-06')).movements.find((row) => row.id === id)).toMatchObject({
      description: 'LUZ',
    });
    expectProblem(
      await http().post('/api/movements').auth(admin, { type: 'bearer' }).send({
        date: '2022-05-13',
        category: 'GARBAGE',
        amount: 15000,
        unit: null,
        description: null,
        week: '2022-05-09',
      }),
      409,
      'GARBAGE_WEEK_PAID',
    );
    await http().delete(`/api/movements/${id}`).auth(admin, { type: 'bearer' }).expect(204);

    const sheet = await http()
      .post('/api/history/sheets')
      .auth(admin, { type: 'bearer' })
      .send({ ...sheetBody, month: '2022-10' })
      .expect(201);
    const sheetId = (sheet.body as { id: string }).id;
    await http()
      .put(`/api/history/sheets/${sheetId}`)
      .auth(admin, { type: 'bearer' })
      .send({
        ...sheetBody,
        opening: 403885,
        closing: 709285,
        lines: [{ unit: 202, ownerName: 'NOMBRE', current: 70000, other: null, text: '' }],
      })
      .expect(204);
    expect((await paperMonth('2022-10')).sheets[0]).toMatchObject({
      opening: 403885,
      closing: 709285,
      lines: [{ unit: 202, ownerName: 'NOMBRE', current: 70000, other: null, text: '' }],
    });
    expectProblem(
      await http()
        .post('/api/history/sheets')
        .auth(owner501, { type: 'bearer' })
        .send({ ...sheetBody, month: '2022-10', fromDay: 11 }),
      403,
      'SUPERADMIN_ONLY',
    );
    await http()
      .delete(`/api/history/sheets/${sheetId}`)
      .auth(admin, { type: 'bearer' })
      .expect(204);

    expect(await auditActionsSince(before)).toEqual([]);
  });

  it('prints a month of the history, and is checked by closing its months, in order', async () => {
    await imported();
    const pdf = await http()
      .get('/api/months/2022-05/report.pdf')
      .auth(owner501, { type: 'bearer' })
      .expect(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');

    const before = await newestAuditId();
    await http().post('/api/months/2022-05/close').auth(admin, { type: 'bearer' }).expect(204);
    expect(await auditActionsSince(before)).toEqual(['MONTH_CLOSED']);
    expectProblem(
      await http()
        .post('/api/history/sheets')
        .auth(admin, { type: 'bearer' })
        .send({ ...sheetBody, month: '2022-05', fromDay: 11 }),
      409,
      'MONTH_CLOSED',
    );

    // The cut-over opens with what the history closes with, and charges its fees.
    await http().post('/api/months/2025-05/open').auth(admin, { type: 'bearer' }).expect(200);
    expect((await book('2025-05')).balances?.opening).toBe((await state())!.closing);
    expectProblem(
      await http().post('/api/months/2025-05/close').auth(admin, { type: 'bearer' }),
      409,
      'PREVIOUS_MONTH_OPEN',
    );
  });
});
