import { describe, expect, it } from 'vitest';
import { FakeUnitOfWork, RecordingAuditTrail } from '../../../../test/support/audit-trail.js';
import { FixedClock } from '../../../../test/support/clock.js';
import { withCode } from '../../../../test/support/domain-error.js';
import { FakeMonthLedger } from '../../../../test/support/month-ledger.js';
import { UnitNumber } from '../../../shared-kernel/index.js';
import { LoadShiftCalendar } from '../../shifts/application/index.js';
import {
  admin,
  InMemoryShiftDelegationRepository,
  owner,
} from '../../shifts/application/testing.js';
import { ListUnits } from '../../units/application/index.js';
import { buildingWith } from '../../units/application/testing.js';
import { d, expense, garbage, payment, pesos } from '../domain/testing.js';
import { CashbookAccess } from './cashbook-access.js';
import { ReadCashbook } from './read-cashbook.js';
import {
  AddMovement,
  RecordCleaningVisits,
  RemoveMovement,
  ReviseMovement,
} from './record-movements.js';
import { InMemoryCashMovementRepository } from './testing.js';

// 501 holds Aug–Sep 2026 and 502 Oct–Nov. September is open (501's grace days) and so is
// October; August is closed.
function setup(today = '2026-10-03') {
  const movements = new InMemoryCashMovementRepository();
  const ledger = new FakeMonthLedger()
    .set('2026-08', 'CLOSED')
    .set('2026-09', 'OPEN')
    .set('2026-10', 'OPEN');
  const unitOfWork = new FakeUnitOfWork();
  const audit = new RecordingAuditTrail(unitOfWork);
  const calendars = new LoadShiftCalendar(
    new InMemoryShiftDelegationRepository(),
    new ListUnits(buildingWith()),
  );
  const access = new CashbookAccess(movements, ledger, FixedClock.on(today), calendars);
  return {
    movements,
    audit,
    read: new ReadCashbook(movements, ledger),
    add: new AddMovement(movements, unitOfWork, audit, access),
    revise: new ReviseMovement(movements, unitOfWork, audit, access),
    remove: new RemoveMovement(movements, unitOfWork, audit, access),
    visits: new RecordCleaningVisits(movements, unitOfWork, audit, access),
  };
}

describe('recording movements', () => {
  it('adds a row to an open month and audits every field', async () => {
    const fx = setup();

    const row = await fx.add.execute(owner(502), payment('2026-10-03', 401, 1400));

    const book = await fx.read.month(row.month);
    expect(book.movements.map((m) => m.id)).toEqual([row.id]);
    expect(book.totals().income).toEqual(pesos(1400));
    expect(fx.audit.entries[0]?.change).toEqual({
      action: 'CASH_MOVEMENT_ADDED',
      entity: 'cash_movement',
      entityId: row.id,
      entityLabel: '2026-10-03 · 401',
      changes: [
        { field: 'date', before: null, after: '2026-10-03' },
        { field: 'category', before: null, after: 'UNIT_PAYMENT' },
        { field: 'amount', before: null, after: 140000 },
        { field: 'unit', before: null, after: 401 },
      ],
    });
  });

  it('lets the outgoing owner square the previous month during the grace days', async () => {
    const fx = setup('2026-10-05');

    await fx.add.execute(owner(501), expense('2026-09-28', 'GARBAGE', 150));
    await expect(
      setup('2026-10-06').add.execute(owner(501), expense('2026-09-28', 'GARBAGE', 150)),
    ).rejects.toThrow(withCode('OUTSIDE_WRITE_WINDOW'));
  });

  it('refuses months the actor does not answer for, and months not open', async () => {
    const fx = setup();

    await expect(fx.add.execute(owner(401), payment('2026-10-03', 401))).rejects.toThrow(
      withCode('NOT_RESPONSIBLE'),
    );
    await expect(fx.add.execute(admin, payment('2026-11-03', 401))).rejects.toThrow(
      withCode('MONTH_NOT_OPENED'),
    );
    await expect(fx.add.execute(admin, payment('2026-08-03', 401))).rejects.toThrow(
      withCode('MONTH_CLOSED'),
    );
    expect(fx.audit.entries).toEqual([]);
  });

  it('applies the category rules and records nothing when they fail', async () => {
    const fx = setup();

    await expect(
      fx.add.execute(owner(502), { ...payment('2026-10-03', 401), unit: null }),
    ).rejects.toThrow(withCode('MOVEMENT_UNIT_REQUIRED'));
    await expect(
      fx.add.execute(owner(502), expense('2026-10-03', 'OTHER_EXPENSE', 90)),
    ).rejects.toThrow(withCode('MOVEMENT_DESCRIPTION_REQUIRED'));
    expect(fx.movements.rows.size).toBe(0);
  });

  it('revises a row within its month, auditing only what changed', async () => {
    const fx = setup();
    const row = await fx.add.execute(owner(502), expense('2026-10-04', 'CLEANING', 270));

    await fx.revise.execute(owner(502), row.id, { amount: pesos(300), date: d('2026-10-05') });

    expect(fx.audit.entries[1]?.change.changes).toEqual([
      { field: 'date', before: '2026-10-04', after: '2026-10-05' },
      { field: 'amount', before: 27000, after: 30000 },
    ]);
    await expect(fx.revise.execute(owner(502), row.id, { date: d('2026-11-01') })).rejects.toThrow(
      withCode('MOVEMENT_OUTSIDE_MONTH'),
    );
  });

  it('removes a row from the list and the totals, keeping what it was in the log', async () => {
    const fx = setup();
    const row = await fx.add.execute(owner(502), expense('2026-10-04', 'GARBAGE', 150));

    await fx.remove.execute(owner(502), row.id);

    const book = await fx.read.month(row.month);
    expect(book.movements).toEqual([]);
    expect(book.totals().expense).toEqual(pesos(0));
    expect(fx.audit.entries[1]?.change).toMatchObject({
      action: 'CASH_MOVEMENT_REMOVED',
      changes: expect.arrayContaining([{ field: 'amount', before: 15000, after: null }]) as unknown,
    });
    await expect(fx.remove.execute(owner(502), row.id)).rejects.toThrow(
      withCode('MOVEMENT_REMOVED'),
    );
    await expect(fx.remove.execute(owner(502), 'missing')).rejects.toThrow(
      withCode('MOVEMENT_NOT_FOUND'),
    );
  });

  it('lists the live payments of one depto or of all', async () => {
    const fx = setup();
    await fx.add.execute(owner(502), payment('2026-10-03', 401));
    const removed = await fx.add.execute(owner(502), payment('2026-10-04', 401));
    await fx.add.execute(owner(502), payment('2026-10-05', 102));
    await fx.remove.execute(owner(502), removed.id);

    expect(await fx.read.payments()).toHaveLength(2);
    expect((await fx.read.payments(UnitNumber.of(401))).map((m) => String(m.date))).toEqual([
      '2026-10-03',
    ]);
  });
});

describe('garbage weeks', () => {
  it('pays each week once, even from another month', async () => {
    const fx = setup();
    // The superadmin records in October a late payment for the week of 21 September, so 501
    // cannot pay that week again from September.
    const late = await fx.add.execute(admin, garbage('2026-10-01', '2026-09-21'));
    await expect(fx.add.execute(owner(501), garbage('2026-09-27', '2026-09-21'))).rejects.toThrow(
      withCode('GARBAGE_WEEK_PAID'),
    );
    expect(fx.audit.actions).toEqual(['CASH_MOVEMENT_ADDED']);

    // Removing the row frees the week.
    await fx.remove.execute(admin, late.id);
    await fx.add.execute(owner(501), garbage('2026-09-27', '2026-09-21'));
  });

  it('refuses moving a row onto a week another row pays for', async () => {
    const fx = setup();
    await fx.add.execute(owner(502), garbage('2026-10-04', '2026-09-28'));
    const next = await fx.add.execute(owner(502), garbage('2026-10-11', '2026-10-05'));
    await expect(fx.revise.execute(owner(502), next.id, { week: d('2026-09-28') })).rejects.toThrow(
      withCode('GARBAGE_WEEK_PAID'),
    );
    // Revising its own date keeps its week.
    await fx.revise.execute(owner(502), next.id, { date: d('2026-10-12') });
  });

  it('shows which of the month’s weeks are paid, pending or still to come', async () => {
    const fx = setup('2026-10-14');
    await fx.add.execute(owner(502), garbage('2026-10-04', '2026-09-28'));
    const weeks = await fx.read.garbageWeeks(d('2026-10-01').yearMonth, d('2026-10-14'));
    expect(weeks.map((w) => [String(w.week), w.status])).toEqual([
      ['2026-09-28', 'PAID'],
      ['2026-10-05', 'PENDING'],
      ['2026-10-12', 'PENDING'],
      ['2026-10-19', 'UPCOMING'],
    ]);
  });
});

describe('cleaning visits', () => {
  it('records one audited row per visit, in the month of each date', async () => {
    const fx = setup('2026-10-03');
    // The week of 28 September crosses into October; 502 answers for October only, so the
    // superadmin marks the whole week.
    const rows = await fx.visits.execute(admin, {
      dates: [d('2026-10-02'), d('2026-09-28'), d('2026-09-30')],
      amount: pesos(270),
    });
    expect(rows.map((r) => String(r.date))).toEqual(['2026-09-28', '2026-09-30', '2026-10-02']);
    expect(fx.audit.actions).toEqual(Array(3).fill('CASH_MOVEMENT_ADDED'));
    expect((await fx.read.month(d('2026-09-01').yearMonth)).totals().expense).toEqual(pesos(540));

    const [week] = await fx.read.cleaningPayouts(d('2026-10-01').yearMonth);
    expect(week && [String(week.weekStart), week.dates.length, week.total]).toEqual([
      '2026-09-28',
      3,
      pesos(810),
    ]);
  });

  it('records all the visits or none', async () => {
    const fx = setup('2026-10-03');
    await fx.visits.execute(owner(502), { dates: [d('2026-10-02')], amount: pesos(270) });
    await expect(
      fx.visits.execute(owner(502), {
        dates: [d('2026-10-01'), d('2026-10-02')],
        amount: pesos(270),
      }),
    ).rejects.toThrow(withCode('CLEANING_VISIT_RECORDED'));
    // 502 cannot write September, so the October visit of the batch is not kept either.
    await expect(
      fx.visits.execute(owner(502), {
        dates: [d('2026-09-30'), d('2026-10-01')],
        amount: pesos(270),
      }),
    ).rejects.toThrow(withCode('NOT_RESPONSIBLE'));
    expect(fx.movements.rows.size).toBe(1);
    expect(fx.audit.entries).toHaveLength(1);
  });
});
