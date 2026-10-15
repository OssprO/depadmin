import {
  auditLogPageSchema,
  type HistoryFile,
  historicalMonthSchema,
  historyPreviewSchema,
  historyStateSchema,
  problemDetailsSchema,
  unitSchema,
} from '@depadmin/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { givenAccounts, tokenFor } from './support/accounts.js';
import { useTestApp } from './support/app.js';
import { FixedClock } from './support/clock.js';
import { useTestDatabase } from './support/database.js';

useTestDatabase();
const api = useTestApp({ clock: FixedClock.on('2026-10-02') });
const http = () => request(api.app.getHttpServer());

let admin: string;
let owner501: string;

beforeEach(async () => {
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
      notes: [{ unit: 301, text: 'PAGÓ EN JULIO 2022' }],
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
    version: 1,
    openingBalance: 71225,
    months,
    owners: [{ unit: 101, name: 'NOMBRE DE PRUEBA' }],
  };
}

const state = async () =>
  historyStateSchema.parse(
    (await http().get('/api/history').auth(admin, { type: 'bearer' }).expect(200)).body,
  ).history;

const month = async (value: string) =>
  historicalMonthSchema.parse(
    (await http().get(`/api/history/months/${value}`).auth(admin, { type: 'bearer' }).expect(200))
      .body,
  );

describe('history API', () => {
  it('previews and imports a file larger than the default body limit, outside the audit log', async () => {
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
      status: 'IN_REVIEW',
    });
    expect(preview.months[0]).toMatchObject({ closing: 116225, ownGap: 0, carriedGap: 0 });
    expect(await state()).toBeNull();

    await http().post('/api/history').auth(admin, { type: 'bearer' }).send(body).expect(204);
    expect((await state())!.months).toHaveLength(36);

    const may = await month('2022-05');
    expect(may).toMatchObject({ canEdit: true, previous: null, next: '2022-06' });
    expect(may.sheets[0]!.notes).toEqual([{ unit: 301, text: 'PAGÓ EN JULIO 2022' }]);
    expect(may.movements.map((row) => row.category)).toEqual(['UNIT_PAYMENT', 'GARBAGE']);

    const units = unitSchema
      .array()
      .parse((await http().get('/api/units').auth(admin, { type: 'bearer' }).expect(200)).body);
    expect(units.find((unit) => unit.number === 101)!.ownerName).toBe('NOMBRE DE PRUEBA');

    // Only the owner's name, which is current data, went to the audit log.
    const log = auditLogPageSchema.parse(
      (await http().get('/api/audit-log').auth(admin, { type: 'bearer' }).expect(200)).body,
    );
    expect(log.entries.map((entry) => entry.action)).toEqual(['UNIT_OWNER_RENAMED']);

    expectProblem(
      await http().post('/api/history').auth(admin, { type: 'bearer' }).send(body),
      409,
      'HISTORY_ALREADY_IMPORTED',
    );
  });

  it('is for the superadmin only', async () => {
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
      .send({ ...file(), version: 2 });
    expectProblem(response, 400, 'VALIDATION_FAILED');
  });

  it('corrects rows and sheets while in review, and discards it to import again', async () => {
    await http().post('/api/history').auth(admin, { type: 'bearer' }).send(file()).expect(204);

    const added = await http()
      .post('/api/history/movements')
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
    await http()
      .put(`/api/history/movements/${id}`)
      .auth(admin, { type: 'bearer' })
      .send({
        date: '2022-06-13',
        category: 'OTHER_EXPENSE',
        amount: 51100,
        unit: null,
        description: 'PAGO DE LUZ',
        week: null,
      })
      .expect(204);
    expect((await month('2022-06')).movements.find((row) => row.id === id)).toMatchObject({
      date: '2022-06-13',
      description: 'PAGO DE LUZ',
    });
    expectProblem(
      await http().post('/api/history/movements').auth(admin, { type: 'bearer' }).send({
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
    await http().delete(`/api/history/movements/${id}`).auth(admin, { type: 'bearer' }).expect(204);

    const sheet = await http()
      .post('/api/history/sheets')
      .auth(admin, { type: 'bearer' })
      .send({
        month: '2022-10',
        fromDay: 1,
        source: 'foto nueva',
        opening: null,
        income: null,
        expense: null,
        closing: null,
        alerts: [],
        notes: [],
      })
      .expect(201);
    const sheetId = (sheet.body as { id: string }).id;
    await http()
      .put(`/api/history/sheets/${sheetId}`)
      .auth(admin, { type: 'bearer' })
      .send({
        fromDay: 1,
        source: 'foto nueva',
        opening: 403885,
        income: null,
        expense: null,
        closing: 709285,
        alerts: [],
        notes: [],
      })
      .expect(204);
    expect((await month('2022-10')).sheets[0]).toMatchObject({ opening: 403885, closing: 709285 });
    await http()
      .delete(`/api/history/sheets/${sheetId}`)
      .auth(admin, { type: 'bearer' })
      .expect(204);

    await http().delete('/api/history').auth(admin, { type: 'bearer' }).expect(204);
    expect(await state()).toBeNull();
    await http().post('/api/history').auth(admin, { type: 'bearer' }).send(file()).expect(204);
  });

  it('keeps the live books after the history, and shows how the two meet', async () => {
    await http().post('/api/history').auth(admin, { type: 'bearer' }).send(file()).expect(204);

    expectProblem(
      await http()
        .put('/api/reporting-start')
        .auth(admin, { type: 'bearer' })
        .send({ month: '2025-04', openingBalance: 0 }),
      409,
      'HISTORY_OVERLAPS_BOOKS',
    );
    await http()
      .put('/api/reporting-start')
      .auth(admin, { type: 'bearer' })
      .send({ month: '2025-05', openingBalance: 100000 })
      .expect(204);

    const history = (await state())!;
    expect(history.cutover).toEqual({
      month: '2025-05',
      openingBalance: 100000,
      difference: 100000 - history.closing,
    });
  });
});
