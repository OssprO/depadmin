import { accountStatementSchema, problemDetailsSchema } from '@depadmin/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { RateSettings } from '../src/modules/settings/domain/index.js';
import { PrismaRateSettingsRepository } from '../src/modules/settings/infrastructure/prisma-rate-settings.repository.js';
import { LocalDate } from '../src/shared-kernel/index.js';
import { givenAccounts, tokenFor } from './support/accounts.js';
import { useTestApp } from './support/app.js';
import { FixedClock } from './support/clock.js';
import { useTestDatabase } from './support/database.js';

const ctx = useTestDatabase();
// 17 November 2026: the books start in October, and November is open.
const api = useTestApp({ clock: FixedClock.on('2026-11-17') });
const http = () => request(api.app.getHttpServer());
let admin: string;

beforeEach(async () => {
  await new PrismaRateSettingsRepository(ctx.database).save(
    RateSettings.startingOn(LocalDate.of(2026, 8, 1)),
  );
  await givenAccounts(ctx.database, []);
  admin = await tokenFor(api.app, 'admin');
  await http()
    .put('/api/reporting-start')
    .auth(admin, { type: 'bearer' })
    .send({ month: '2026-10', openingBalance: 500000 })
    .expect(204);
  await http().post('/api/months/2026-11/open').auth(admin, { type: 'bearer' }).expect(200);
});

const folioOf = async (id: string) =>
  (await ctx.database.client.cashMovement.findUniqueOrThrow({ where: { id } })).receiptNumber;
/** Records a row through the API; the response only has its id, the folio is read back. */
const add = async (body: object) => {
  const response = await http()
    .post('/api/movements')
    .auth(admin, { type: 'bearer' })
    .send({ unit: null, description: null, week: null, ...body })
    .expect(201);
  const { id } = z.object({ id: z.uuid() }).parse(response.body);
  return { id, receiptNumber: await folioOf(id) };
};
const pay = (unit: number, amount: number, date = '2026-11-10') =>
  add({ date, category: 'UNIT_PAYMENT', amount, unit });

/** The response body as bytes (supertest only buffers text and JSON on its own). */
const binary = (res: request.Response, done: (error: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => done(null, Buffer.concat(chunks)));
};

describe('folios', () => {
  it('numbers live payments one after another, and never reuses a removed one', async () => {
    const first = await pay(401, 140000);
    const cleaning = await add({ date: '2026-11-10', category: 'CLEANING', amount: 27000 });
    const second = await pay(302, 70000);
    await http().delete(`/api/movements/${second.id}`).auth(admin, { type: 'bearer' }).expect(204);
    const third = await pay(501, 70000);

    const folios = await Promise.all([first, cleaning, second, third].map((m) => folioOf(m.id)));
    const [one, none, two, three] = folios;
    expect(none).toBeNull();
    expect([two! - one!, three! - two!]).toEqual([1, 1]);
    expect(first.receiptNumber).toBe(one);
  });

  it('leaves the payments before the cut-over (the history) without one', async () => {
    const id = randomUUID();
    await ctx.database.client.cashMovement.create({
      data: {
        id,
        date: new Date('2026-09-15T00:00:00Z'),
        category: 'UNIT_PAYMENT',
        amount: 70000,
        unitNumber: 401,
      },
    });

    expect(await folioOf(id)).toBeNull();
  });
});

describe('receipts, statements and the CSV export', () => {
  it('downloads a payment’s receipt as a PDF named after its folio', async () => {
    const payment = await pay(401, 140000);

    const res = await http()
      .get(`/api/movements/${payment.id}/receipt.pdf`)
      .auth(admin, { type: 'bearer' })
      .buffer(true)
      .parse(binary)
      .expect(200);

    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toBe(
      `attachment; filename="recibo-${String(payment.receiptNumber).padStart(4, '0')}.pdf"`,
    );
    expect((res.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
  }, 20_000);

  it('has no receipt for an expense, and a statement only as of a closed month', async () => {
    const cleaning = await add({ date: '2026-11-10', category: 'CLEANING', amount: 27000 });
    const missing = await http()
      .get(`/api/movements/${cleaning.id}/receipt.pdf`)
      .auth(admin, { type: 'bearer' });
    expect(missing.status).toBe(404);
    expect(problemDetailsSchema.parse(missing.body).code).toBe('RECEIPT_NOT_FOUND');

    const open = await http()
      .get('/api/accounts/401/statement.pdf')
      .query({ through: '2026-11' })
      .auth(admin, { type: 'bearer' });
    expect(problemDetailsSchema.parse(open.body).code).toBe('MONTH_NOT_CLOSED');

    const today = await http()
      .get('/api/accounts/401/statement.pdf')
      .auth(admin, { type: 'bearer' })
      .buffer(true)
      .parse(binary)
      .expect(200);
    expect(today.headers['content-disposition']).toBe(
      'attachment; filename="estado-de-cuenta-401-2026-11-17.pdf"',
    );
  }, 20_000);

  it('lists the account’s payments with their folios', async () => {
    const payment = await pay(401, 140000);

    const res = await http().get('/api/accounts/401').auth(admin, { type: 'bearer' }).expect(200);

    expect(accountStatementSchema.parse(res.body).payments).toEqual([
      { id: payment.id, date: '2026-11-10', amount: 140000, receiptNumber: payment.receiptNumber },
    ]);
  });

  it('exports a range of months as CSV', async () => {
    await pay(401, 140000);
    await add({
      date: '2026-11-12',
      category: 'OTHER_EXPENSE',
      amount: 52000,
      description: 'Agua, bimestre',
    });

    const res = await http()
      .get('/api/movements.csv')
      .query({ from: '2026-10', to: '2026-11' })
      .auth(admin, { type: 'bearer' })
      .buffer(true)
      .parse(binary)
      .expect(200);

    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
    const lines = (res.body as Buffer).toString('utf8').replace('﻿', '').split('\r\n');
    expect(lines[0]).toBe('Fecha,Tipo,Depto,Descripción,Semana,Ingreso,Egreso,Folio');
    expect(lines[2]).toBe('2026-11-12,Otro egreso,,"Agua, bimestre",,,520.00,');

    const reversed = await http()
      .get('/api/movements.csv')
      .query({ from: '2026-11', to: '2026-10' })
      .auth(admin, { type: 'bearer' });
    expect(reversed.status).toBe(400);
  });
});
