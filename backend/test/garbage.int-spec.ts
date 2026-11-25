import { monthlyReportSchema } from '@depadmin/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { BUILDING_TIME_ZONE, SystemClock } from '../src/platform/clock/system-clock.js';
import { RateSettings } from '../src/modules/settings/domain/index.js';
import { PrismaRateSettingsRepository } from '../src/modules/settings/infrastructure/prisma-rate-settings.repository.js';
import { LocalDate } from '../src/shared-kernel/index.js';
import { givenAccounts, tokenFor } from './support/accounts.js';
import { useTestApp } from './support/app.js';
import { useTestDatabase } from './support/database.js';

// A garbage week asks to be confirmed from the Sunday after its payday (phase 36), and that
// Sunday starts at midnight in the building, as the real clock reads it, not at UTC's.

/** Saturday 31 October 2026, 23:59 in Mexico City (UTC-6): in UTC it is already Sunday. */
const SATURDAY_NIGHT = Date.parse('2026-11-01T05:59:00Z');
let now = SATURDAY_NIGHT;

const ctx = useTestDatabase();
const api = useTestApp({ clock: new SystemClock(BUILDING_TIME_ZONE, () => now) });
const http = () => request(api.app.getHttpServer());

let admin: string;
let owner502: string;

beforeEach(async () => {
  now = SATURDAY_NIGHT;
  await new PrismaRateSettingsRepository(ctx.database).save(
    RateSettings.startingOn(LocalDate.of(2026, 8, 1)),
  );
  await givenAccounts(ctx.database, [502]);
  [admin, owner502] = await Promise.all([tokenFor(api.app, 'admin'), tokenFor(api.app, '502')]);
  await http()
    .put('/api/reporting-start')
    .auth(admin, { type: 'bearer' })
    .send({ month: '2026-08', openingBalance: 500000 })
    .expect(204);
  await http().post('/api/months/2026-10/open').auth(admin, { type: 'bearer' }).expect(200);
});

const october = async () =>
  monthlyReportSchema.parse(
    (await http().get('/api/months/2026-10').auth(owner502, { type: 'bearer' }).expect(200)).body,
  );

describe('garbage weeks in the building’s day', () => {
  it('keeps October’s last week upcoming on its Saturday and asks for it from Sunday', async () => {
    // The week of 26 October is October's, paid on Saturday the 31st.
    expect((await october()).garbageWeeks.at(-1)).toMatchObject({
      week: '2026-10-26',
      status: 'UPCOMING',
      suggestedDate: '2026-10-31',
    });

    now = Date.parse('2026-11-01T06:00:00Z');
    const sunday = await october();
    expect(sunday.canWrite).toBe(true);
    const last = sunday.garbageWeeks.at(-1)!;
    expect(last).toMatchObject({ status: 'PENDING', suggestedDate: '2026-10-31' });

    // «Confirmar» records it on its Saturday, in October.
    await http()
      .post('/api/movements')
      .auth(owner502, { type: 'bearer' })
      .send({
        date: last.suggestedDate,
        category: 'GARBAGE',
        amount: 15000,
        unit: null,
        description: null,
        week: last.week,
      })
      .expect(201);
    expect((await october()).garbageWeeks.at(-1)).toMatchObject({
      status: 'PAID',
      paidBy: { date: '2026-10-31' },
    });
  });
});
