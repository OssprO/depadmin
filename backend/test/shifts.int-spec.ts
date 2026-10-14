import {
  auditLogPageSchema,
  currentShiftResponseSchema,
  problemDetailsSchema,
  shiftCalendarResponseSchema,
  shiftDelegationSchema,
  unitListResponseSchema,
} from '@depadmin/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { PrismaRateSettingsRepository } from '../src/modules/settings/infrastructure/prisma-rate-settings.repository.js';
import { RateSettings } from '../src/modules/settings/domain/index.js';
import { LocalDate } from '../src/shared-kernel/index.js';
import { givenAccounts, tokenFor } from './support/accounts.js';
import { useTestApp } from './support/app.js';
import { FixedClock } from './support/clock.js';
import { useTestDatabase } from './support/database.js';

const ctx = useTestDatabase();
// 2 October 2026: 502's shift has started and 501 is in its handover days.
const OCTOBER_2 = FixedClock.on('2026-10-02').instant;
const clock = new FixedClock(OCTOBER_2);
const api = useTestApp({ clock });
const http = () => request(api.app.getHttpServer());

let admin: string;
let owner501: string;

beforeEach(async () => {
  clock.instant = OCTOBER_2;
  await new PrismaRateSettingsRepository(ctx.database).save(
    RateSettings.startingOn(LocalDate.of(2026, 8, 1)),
  );
  await givenAccounts(ctx.database, [501, 502]);
  [admin, owner501] = await Promise.all([tokenFor(api.app, 'admin'), tokenFor(api.app, '501')]);
});

const expectProblem = (response: request.Response, status: number, code: string) => {
  expect(response.status).toBe(status);
  expect(problemDetailsSchema.parse(response.body).code).toBe(code);
};

describe('shifts API', () => {
  it('shows the current shift and offers the outgoing owner its handover', async () => {
    const response = await http().get('/api/shifts/current').auth(owner501, { type: 'bearer' });

    const current = currentShiftResponseSchema.parse(response.body);
    expect(current.today).toBe('2026-10-02');
    expect(current.current).toMatchObject({
      month: '2026-10',
      scheduledUnit: 502,
      responsibleUnits: [502],
      canDelegate: true,
    });
    expect(current.next).toMatchObject({ month: '2026-12', scheduledUnit: 401 });
  });

  it('records a skipped shift with its penalties, then cancels it', async () => {
    const created = await http()
      .post('/api/shifts/delegations')
      .auth(owner501, { type: 'bearer' })
      .send({ from: '2026-10', to: '2026-11', delegateUnit: 501, reason: 'SKIPPED_SHIFT' })
      .expect(201);
    const delegation = shiftDelegationSchema.parse(created.body);
    expect(delegation).toMatchObject({ originalUnit: 502, delegateUnit: 501 });

    const calendar = shiftCalendarResponseSchema.parse(
      (
        await http()
          .get('/api/shifts/calendar')
          .query({ from: '2026-10', to: '2026-12' })
          .auth(admin, { type: 'bearer' })
          .expect(200)
      ).body,
    );
    expect(calendar.map((month) => month.responsibleUnits)).toEqual([
      [502, 501],
      [502, 501],
      [401],
    ]);
    const penalties = () =>
      ctx.database.client.charge.findMany({
        where: { type: 'SHIFT_SKIP_PENALTY' },
        orderBy: { month: 'asc' },
      });
    expect((await penalties()).map((c) => [c.unitNumber, c.amount])).toEqual([
      [502, 50000],
      [502, 50000],
    ]);

    // Only the superadmin cancels.
    expectProblem(
      await http()
        .post(`/api/shifts/delegations/${delegation.id}/cancel`)
        .auth(owner501, { type: 'bearer' }),
      403,
      'SUPERADMIN_ONLY',
    );
    await http()
      .post(`/api/shifts/delegations/${delegation.id}/cancel`)
      .auth(admin, { type: 'bearer' })
      .expect(200);
    expect(await penalties()).toEqual([]);

    const log = auditLogPageSchema.parse(
      (
        await http()
          .get('/api/audit-log')
          .query({ entity: 'shift_delegation', entityId: delegation.id })
          .auth(owner501, { type: 'bearer' })
      ).body,
    );
    expect(log.entries.map((e) => [e.action, e.actor.unit])).toEqual([
      ['SHIFT_DELEGATION_CANCELLED', null],
      ['SHIFT_DELEGATION_CREATED', 501],
    ]);
  });

  it('refuses handovers outside the rules', async () => {
    const owner502 = await tokenFor(api.app, '502');
    const handover = (token: string, body: object) =>
      http()
        .post('/api/shifts/delegations')
        .auth(token, { type: 'bearer' })
        .send({
          from: '2026-12',
          to: '2027-01',
          delegateUnit: 402,
          reason: 'SKIPPED_SHIFT',
          ...body,
        });

    // 502 decides who takes December only once its own last month (November) has begun.
    expectProblem(await handover(owner502, {}), 403, 'OUTSIDE_WRITE_WINDOW');
    expectProblem(await handover(owner501, {}), 403, 'NOT_RESPONSIBLE');
    expectProblem(await handover(owner501, { from: '2026-11' }), 422, 'HANDOVER_INVALID');
    expectProblem(await handover(owner501, { to: '2026-11' }), 400, 'VALIDATION_FAILED');
    expectProblem(await handover(owner501, { delegateUnit: 503 }), 400, 'VALIDATION_FAILED');

    clock.instant = FixedClock.on('2026-11-10').instant;
    await handover(await tokenFor(api.app, '502'), {}).expect(201);
  });

  it('validates the calendar range', async () => {
    const calendar = (query: object) =>
      http().get('/api/shifts/calendar').query(query).auth(admin, { type: 'bearer' });

    expectProblem(await calendar({ from: '2026-10' }), 400, 'VALIDATION_FAILED');
    expectProblem(
      await calendar({ from: '2026-01', to: '2030-01' }),
      422,
      'CALENDAR_RANGE_INVALID',
    );
  });
});

describe('units API', () => {
  it('lets the superadmin mark a depto inactive, which leaves its shift uncovered', async () => {
    expectProblem(
      await http()
        .post('/api/units/401/status')
        .auth(owner501, { type: 'bearer' })
        .send({ active: false, from: '2026-12' }),
      403,
      'SUPERADMIN_ONLY',
    );
    await http()
      .post('/api/units/401/status')
      .auth(admin, { type: 'bearer' })
      .send({ active: false, from: '2026-12' })
      .expect(200);

    const units = unitListResponseSchema.parse(
      (await http().get('/api/units').auth(owner501, { type: 'bearer' }).expect(200)).body,
    );
    expect(units.find((unit) => unit.number === 401)).toEqual({
      number: 401,
      activeNow: true,
      inactivePeriods: [{ from: '2026-12', to: null }],
    });
    const december = shiftCalendarResponseSchema.parse(
      (
        await http()
          .get('/api/shifts/calendar')
          .query({ from: '2026-12', to: '2026-12' })
          .auth(admin, { type: 'bearer' })
      ).body,
    );
    expect(december[0]).toMatchObject({ scheduledUnitActive: false, responsibleUnits: [] });

    // The superadmin assigns a cover, with no penalty.
    await http()
      .post('/api/shifts/delegations')
      .auth(admin, { type: 'bearer' })
      .send({ from: '2026-12', to: '2027-01', delegateUnit: 402, reason: 'INACTIVE_UNIT' })
      .expect(201);
    expect(await ctx.database.client.charge.count()).toBe(0);
  });

  it('validates the depto and the month', async () => {
    const setStatus = (number: string, body: object) =>
      http().post(`/api/units/${number}/status`).auth(admin, { type: 'bearer' }).send(body);

    expectProblem(
      await setStatus('503', { active: false, from: '2026-12' }),
      400,
      'VALIDATION_FAILED',
    );
    expectProblem(await setStatus('401', { active: false, from: 'dic' }), 400, 'VALIDATION_FAILED');
    expectProblem(
      await setStatus('401', { active: true, from: '2026-12' }),
      409,
      'UNIT_NOT_INACTIVE',
    );
  });
});
