import { describe, expect, it } from 'vitest';
import { withCode } from '../../../../test/support/domain-error.js';
import { Money, type PaperLine, UnitNumber, YearMonth } from '../../../shared-kernel/index.js';
import { d, expense, garbage, otherIncome, payment, pesos } from '../../cashbook/domain/testing.js';
import { admin, owner } from '../../shifts/application/testing.js';
import type { ReportDocument } from './report-document.js';
import { booksFixture } from './testing.js';

const m = (text: string) => YearMonth.parse(text);
const start = { month: m('2026-08'), openingBalance: pesos(5000) };

// On 2 October 2026 502 holds October; 501 is in its handover days for September.

describe('reporting start', () => {
  it('is set by the superadmin, and audited', async () => {
    const fx = booksFixture('2026-10-02');

    await expect(fx.setStart.execute(owner(501), start)).rejects.toThrow(
      withCode('SUPERADMIN_ONLY'),
    );
    await fx.setStart.execute(admin, start);

    expect(await fx.getStart.execute()).toEqual({ ...start, cutover: start.month });
    expect(fx.audit.entries[0]?.change).toMatchObject({
      action: 'REPORTING_START_SET',
      changes: [
        { field: 'month', before: null, after: '2026-08' },
        { field: 'openingBalance', before: null, after: 500000 },
      ],
    });
  });

  it('keeps its month once a month is open, while the cash can still be corrected', async () => {
    const fx = booksFixture('2026-10-02');
    await fx.setStart.execute(admin, start);
    await fx.open.execute(admin, m('2026-08'));

    await expect(fx.setStart.execute(admin, { ...start, month: m('2026-09') })).rejects.toThrow(
      withCode('REPORTING_START_LOCKED'),
    );
    await fx.setStart.execute(admin, { ...start, openingBalance: pesos(5200) });
    expect(fx.audit.entries.at(-1)?.change.changes).toEqual([
      { field: 'openingBalance', before: 500000, after: 520000 },
    ]);
  });
});

describe("books that start with the building's history", () => {
  // The history runs from May to July 2026; the platform is live from August.
  const history = { month: m('2026-05'), openingBalance: pesos(712.25), cutover: m('2026-08') };

  async function started() {
    const fx = booksFixture('2026-10-02');
    await fx.startWithHistory.execute(admin, history);
    return fx;
  }

  it('opens every month of the history, with no fees and nothing in the audit log', async () => {
    const fx = booksFixture('2026-10-02');
    await expect(fx.startWithHistory.execute(owner(501), history)).rejects.toThrow(
      withCode('SUPERADMIN_ONLY'),
    );
    const opened = await fx.startWithHistory.execute(admin, history);

    expect(opened.map((report) => String(report.month))).toEqual(['2026-05', '2026-06', '2026-07']);
    expect(await fx.getStart.execute()).toEqual(history);
    expect(fx.charges.summary()).toEqual([]);
    expect(fx.audit.entries).toEqual([]);
    const july = await fx.view.execute(admin, m('2026-07'));
    expect(july).toMatchObject({ status: 'OPEN', historical: true, canWrite: true });
    // Nobody holds a month before the rotation, so only the superadmin writes it.
    expect((await fx.view.execute(owner(501), m('2026-07'))).canWrite).toBe(false);
    expect((await fx.view.execute(admin, m('2026-08'))).historical).toBe(false);
  });

  it('needs books that have not started and a history that is over', async () => {
    const fx = await started();
    await expect(fx.startWithHistory.execute(admin, history)).rejects.toThrow(
      withCode('BOOKS_ALREADY_STARTED'),
    );
    const empty = booksFixture('2026-10-02');
    await expect(
      empty.startWithHistory.execute(admin, { ...history, cutover: m('2026-05') }),
    ).rejects.toThrow(withCode('HISTORY_FILE_INVALID'));
    await expect(
      empty.startWithHistory.execute(admin, { ...history, cutover: m('2026-11') }),
    ).rejects.toThrow(withCode('MONTH_NOT_STARTED'));
  });

  it('keeps its first month, while the cash can be corrected', async () => {
    const fx = await started();
    await expect(
      fx.setStart.execute(admin, { month: m('2026-08'), openingBalance: pesos(18_000) }),
    ).rejects.toThrow(withCode('REPORTING_START_LOCKED'));
    await fx.setStart.execute(admin, { month: m('2026-05'), openingBalance: pesos(700) });
    expect(await fx.getStart.execute()).toEqual({ ...history, openingBalance: pesos(700) });
  });

  it('charges fees and audits from the cut-over on, which opens with what the history left', async () => {
    const fx = await started();
    await fx.add.execute(admin, payment('2026-07-01', 101, 700));
    expect(fx.audit.entries).toEqual([]);

    await fx.open.execute(admin, m('2026-08'));
    expect(fx.charges.summary()).toHaveLength(10);
    expect(fx.audit.actions.filter((a) => a === 'MONTH_OPENED')).toEqual(['MONTH_OPENED']);
    const august = await fx.view.execute(admin, m('2026-08'));
    expect(august.balances?.opening).toEqual(pesos(1412.25));
    await fx.add.execute(admin, payment('2026-08-03', 102, 700));
    expect(fx.audit.actions.at(-1)).toBe('CASH_MOVEMENT_ADDED');
  });

  it('starts the accounts at the cut-over: a payment of the history settled its paper', async () => {
    const fx = await started();
    await fx.add.execute(admin, payment('2026-07-01', 101, 2100));
    await fx.open.execute(admin, m('2026-08'));

    const [account] = (await fx.accounts.all()).filter((a) => a.unit.value === 101);
    expect(account).toMatchObject({ outstandingBalance: pesos(700), creditBalance: Money.ZERO });
    // What the deptos carried into their accounts is dated before the cut-over.
    expect(String((await fx.getOpening.execute()).start)).toBe('2026-08');
  });

  it('is checked month by month: closing them is audited, and the cut-over waits for them', async () => {
    const fx = await started();
    await fx.open.execute(admin, m('2026-08'));
    await fx.close.execute(admin, m('2026-05'));
    expect(fx.audit.actions.at(-1)).toBe('MONTH_CLOSED');
    await expect(fx.close.execute(admin, m('2026-08'))).rejects.toThrow(
      withCode('PREVIOUS_MONTH_OPEN'),
    );
    await fx.close.execute(admin, m('2026-06'));
    await fx.close.execute(admin, m('2026-07'));
    await fx.close.execute(admin, m('2026-08'));
    // Opening balances freeze with the cut-over month, not with the first one.
    await expect(fx.setOpening.execute(admin, UnitNumber.of(101), [], pesos(0))).rejects.toThrow(
      withCode('OPENING_BALANCE_LOCKED'),
    );
  });

  it('lists the months of the history as such', async () => {
    const fx = await started();
    const { months } = await fx.history.execute(admin);
    expect(months.map((entry) => [String(entry.month), entry.historical])).toEqual([
      ['2026-07', true],
      ['2026-06', true],
      ['2026-05', true],
    ]);
  });
});

describe('the report of a month of the history', () => {
  const history = { month: m('2026-06'), openingBalance: pesos(1000), cutover: m('2026-08') };
  const line = (unit: number, text: string, split: Partial<PaperLine> = {}): PaperLine => ({
    unit: UnitNumber.of(unit),
    ownerName: null,
    current: null,
    other: null,
    text,
    ...split,
  });

  /** July 2026 changed hands on the 10th: two sheets, as on paper. */
  async function july() {
    const fx = booksFixture('2026-10-02', {}, { 101: 'DUEÑA DE HOY' });
    await fx.startWithHistory.execute(admin, history);
    // The history's rates, as the import brings them (every rate needs a value in force).
    await fx.earlierRates.execute(
      admin,
      (['maintenanceFee', 'cleaningPerVisit', 'garbageWeekly', 'shiftSkipPenalty'] as const).map(
        (rate) => ({ rate, effectiveFrom: d('2026-06-01'), amount: pesos(700) }),
      ),
    );
    for (const row of [
      payment('2026-07-01', 101, 1400),
      payment('2026-07-01', 102, 1400),
      garbage('2026-07-04', '2026-06-29'),
      payment('2026-07-12', 201, 700),
      expense('2026-07-20', 'OTHER_EXPENSE', 400, 'PAGO DE LUZ'),
    ]) {
      await fx.add.execute(admin, row);
    }
    // Paid on the day the administration changed hands, and listed on the first sheet.
    const handover = await fx.add.execute(admin, garbage('2026-07-10', '2026-07-06'));
    fx.paper.set('2026-07', [
      {
        fromDay: 10,
        responsible: 'Responsable: depto 201',
        movementIds: [],
        lines: [line(201, 'LIQUIDA JUNIO', { current: Money.ZERO, other: pesos(700) })],
      },
      {
        fromDay: 1,
        responsible: null,
        movementIds: [handover.id],
        lines: [
          line(101, 'ADELANTA AGOSTO', { ownerName: 'DUEÑA DE ENTONCES' }),
          line(102, 'LIQUIDA JUNIO', { current: pesos(700), other: pesos(700) }),
        ],
      },
    ]);
    return fx;
  }

  it('reads like its paper: one document per sheet, chained, with its lines per depto', async () => {
    const fx = await july();
    const [first, second] = await fx.pdf.documents(m('2026-07'));

    expect(first).toMatchObject({
      days: { from: 1, to: 9 },
      administration: null,
      openingBalance: pesos(1000),
      income: pesos(2800),
      expense: pesos(300),
      closingBalance: pesos(3500),
    });
    expect(second).toMatchObject({
      days: { from: 10, to: 31 },
      responsible: 'Responsable: depto 201',
      openingBalance: pesos(3500),
      income: pesos(700),
      expense: pesos(400),
      closingBalance: pesos(3800),
    });
    const unit = (doc: ReportDocument | undefined, n: number) =>
      doc!.units.find((u) => u.unit.value === n)!;
    // Where the paper does not split a payment, the month's fee goes to MES EN CURSO.
    expect(unit(first, 101)).toMatchObject({
      ownerName: 'DUEÑA DE ENTONCES',
      paper: { current: pesos(700), other: pesos(700), text: 'ADELANTA AGOSTO' },
    });
    expect(unit(first, 102).paper).toEqual({
      current: pesos(700),
      other: pesos(700),
      text: 'LIQUIDA JUNIO',
    });
    expect(unit(second, 201).paper).toEqual({
      current: Money.ZERO,
      other: pesos(700),
      text: 'LIQUIDA JUNIO',
    });
    // No paper line: today's owner, nothing paid, nothing said.
    expect(unit(second, 101)).toMatchObject({
      ownerName: 'DUEÑA DE HOY',
      paid: Money.ZERO,
      paper: { current: Money.ZERO, other: Money.ZERO, text: '' },
    });
    // Only the weeks paid, as the paper listed them; no accounts before the cut-over.
    expect(first!.garbage.map((g) => String(g.week))).toEqual(['2026-06-29', '2026-07-06']);
    expect(second!.garbage).toEqual([]);
    expect(unit(first, 101)).toMatchObject({ owed: [], currentFee: null });
    await fx.pdf.execute(m('2026-07'));
    expect(fx.renderer.documents).toHaveLength(2);
  });

  it('is one document from its rows when its paper is missing', async () => {
    const fx = await july();
    const documents = await fx.pdf.documents(m('2026-06'));
    expect(documents).toHaveLength(1);
    expect(documents[0]).toMatchObject({ days: null, administration: null, status: 'OPEN' });
  });
});

describe('OpenMonth', () => {
  it('opens every month up to the one asked for, charging each its fees', async () => {
    const fx = booksFixture('2026-10-02');
    await fx.setStart.execute(admin, start);

    const opened = await fx.open.execute(owner(502), m('2026-10'));

    expect(opened.map((report) => String(report.month))).toEqual(['2026-08', '2026-09', '2026-10']);
    expect(fx.charges.summary()).toHaveLength(30);
    expect(fx.audit.actions.filter((a) => a === 'MONTH_OPENED')).toHaveLength(3);
    expect(await fx.open.execute(owner(502), m('2026-10'))).toEqual([]);
    expect(fx.charges.summary()).toHaveLength(30);
  });

  it('needs the books started, a month that has begun, and someone who can write it', async () => {
    const fx = booksFixture('2026-10-02');

    await expect(fx.open.execute(admin, m('2026-10'))).rejects.toThrow(
      withCode('REPORTING_NOT_STARTED'),
    );
    await fx.setStart.execute(admin, start);
    await expect(fx.open.execute(admin, m('2026-11'))).rejects.toThrow(
      withCode('MONTH_NOT_STARTED'),
    );
    await expect(fx.open.execute(admin, m('2026-07'))).rejects.toThrow(
      withCode('MONTH_BEFORE_START'),
    );
    await expect(fx.open.execute(owner(401), m('2026-10'))).rejects.toThrow(
      withCode('NOT_RESPONSIBLE'),
    );
  });
});

describe('GetMonthlyReport', () => {
  it('says the books have not started, with nothing to do but wait', async () => {
    const fx = booksFixture('2026-10-02');

    const view = await fx.view.execute(owner(502), m('2026-10'));

    expect(view).toMatchObject({
      status: 'NOT_OPENED',
      reportingStarted: false,
      balances: null,
      canOpen: false,
      canWrite: false,
    });
  });

  it('offers to open the month to whoever can write it', async () => {
    const fx = booksFixture('2026-10-02');
    await fx.setStart.execute(admin, start);

    expect((await fx.view.execute(owner(502), m('2026-10'))).canOpen).toBe(true);
    expect((await fx.view.execute(owner(401), m('2026-10'))).canOpen).toBe(false);
    expect((await fx.view.execute(admin, m('2026-11'))).canOpen).toBe(false);
  });

  it('carries the balance through open months and shows what each payment covered', async () => {
    const fx = booksFixture('2026-10-02');
    await fx.setStart.execute(admin, start);
    await fx.open.execute(admin, m('2026-10'));
    await fx.add.execute(admin, payment('2026-08-05', 401, 700));
    await fx.add.execute(admin, expense('2026-09-10', 'GARBAGE', 150));
    await fx.add.execute(owner(502), payment('2026-10-03', 401, 1050));
    await fx.add.execute(owner(502), expense('2026-10-04', 'CLEANING', 270));

    const view = await fx.view.execute(owner(502), m('2026-10'));

    // 5,000 + 700 − 150 = 5,550 at the start of October; + 1,050 − 270 = 6,330.
    expect(view.balances).toEqual({ opening: pesos(5550), closing: pesos(6330) });
    expect(view.status).toBe('OPEN');
    expect(view.canWrite).toBe(true);
    expect(view.totals.income).toEqual(pesos(1050));
    const [paid] = view.rows;
    expect(paid?.coverage.map((c) => [String(c.month), c.amount.centavos, c.settles])).toEqual([
      ['2026-09', 70000, true],
      ['2026-10', 35000, false],
    ]);
    expect(view.suggestions?.cleaningPerVisit).toEqual(pesos(270));
    const account401 = view.accounts.find((a) => a.unit === UnitNumber.of(401));
    expect(account401?.outstandingBalance).toEqual(pesos(350));
    expect((await fx.view.execute(owner(401), m('2026-10'))).canWrite).toBe(false);
  });

  it('suggests the pending garbage weeks without counting them, and sums cleaning by week', async () => {
    const fx = booksFixture('2026-10-09');
    await fx.setStart.execute(admin, start);
    await fx.open.execute(admin, m('2026-10'));
    await fx.add.execute(admin, expense('2026-09-29', 'CLEANING', 270));
    await fx.add.execute(owner(502), expense('2026-10-01', 'CLEANING', 270));

    const before = await fx.view.execute(owner(502), m('2026-10'));
    expect(before.garbageWeeks.map((w) => [String(w.week), w.status])).toEqual([
      ['2026-09-28', 'PENDING'],
      ['2026-10-05', 'PENDING'],
      ['2026-10-12', 'UPCOMING'],
      ['2026-10-19', 'UPCOMING'],
      ['2026-10-26', 'UPCOMING'],
    ]);
    expect(before.totals.byCategory.GARBAGE).toEqual(pesos(0));
    expect(before.cleaningPayouts.map((p) => [String(p.weekStart), p.total])).toEqual([
      ['2026-09-28', pesos(540)],
    ]);

    const [first] = before.garbageWeeks;
    await fx.add.execute(owner(502), {
      ...expense(String(first!.suggestedDate), 'GARBAGE', 150),
      week: first!.week,
    });
    const after = await fx.view.execute(owner(502), m('2026-10'));
    expect(after.garbageWeeks[0]?.status).toBe('PAID');
    expect(after.totals.byCategory.GARBAGE).toEqual(pesos(150));
  });

  it('does not suggest the week that began before the books', async () => {
    const fx = booksFixture('2026-08-10');
    await fx.setStart.execute(admin, start);
    await fx.open.execute(admin, m('2026-08'));

    // 1 August 2026 is a Saturday: its week began on 27 July, on paper.
    const august = await fx.view.execute(admin, m('2026-08'));
    expect(august.garbageWeeks.map((w) => String(w.week))).toEqual([
      '2026-08-03',
      '2026-08-10',
      '2026-08-17',
      '2026-08-24',
    ]);
  });

  it('works before any rate is in force', async () => {
    const fx = booksFixture('2026-10-02');

    expect((await fx.view.execute(admin, m('2026-01'))).suggestions).toBeNull();
  });
});

describe('GetAccounts', () => {
  it('adds up what each depto owes and has paid ahead', async () => {
    const fx = booksFixture('2026-10-02');
    await fx.setStart.execute(admin, start);
    await fx.open.execute(admin, m('2026-09'));
    await fx.add.execute(admin, payment('2026-09-05', 101, 2100));

    const accounts = await fx.accounts.all();
    const of = (unit: number) => accounts.find((a) => a.unit.value === unit)!;

    expect([of(101).outstandingBalance, of(101).creditBalance]).toEqual([Money.ZERO, pesos(700)]);
    expect(of(102).outstandingBalance).toEqual(pesos(1400));
    expect((await fx.accounts.of(UnitNumber.of(101))).lines).toHaveLength(2);
  });
});

describe('CloseMonth', () => {
  /** Books from August with a payment in each month, on the given day. */
  async function booksOn(today: string) {
    const fx = booksFixture(today);
    await fx.setStart.execute(admin, start);
    await fx.open.execute(admin, m(today.slice(0, 7)));
    await fx.add.execute(admin, payment('2026-08-05', 401, 700));
    await fx.add.execute(admin, payment('2026-09-05', 401, 700));
    return fx;
  }

  it('lets the outgoing owner close their months in the handover, freezing them', async () => {
    const fx = await booksOn('2026-10-02');

    await fx.close.execute(owner(501), m('2026-08'));
    await fx.close.execute(owner(501), m('2026-09'));

    const september = await fx.view.execute(owner(501), m('2026-09'));
    expect(september).toMatchObject({ status: 'CLOSED', canWrite: false, canClose: false });
    expect(september.balances).toEqual({ opening: pesos(5700), closing: pesos(6400) });
    expect(fx.audit.entries.at(-1)?.change).toMatchObject({
      action: 'MONTH_CLOSED',
      entityId: '2026-09',
      changes: [
        { field: 'status', before: 'OPEN', after: 'CLOSED' },
        { field: 'openingBalance', before: null, after: 570000 },
        { field: 'income', before: null, after: 70000 },
        { field: 'expense', before: null, after: 0 },
        { field: 'closingBalance', before: null, after: 640000 },
      ],
    });
    await expect(fx.add.execute(admin, payment('2026-09-06', 402, 700))).rejects.toThrow(
      withCode('MONTH_CLOSED'),
    );
  });

  it('closes a month once it is over, after the month before, by whoever may', async () => {
    const fx = await booksOn('2026-10-02');

    await expect(fx.close.execute(owner(501), m('2026-09'))).rejects.toThrow(
      withCode('PREVIOUS_MONTH_OPEN'),
    );
    await expect(fx.close.execute(owner(502), m('2026-08'))).rejects.toThrow(
      withCode('NOT_RESPONSIBLE'),
    );
    await expect(fx.close.execute(admin, m('2026-10'))).rejects.toThrow(
      withCode('MONTH_IN_PROGRESS'),
    );
    await expect(fx.close.execute(admin, m('2026-11'))).rejects.toThrow(
      withCode('MONTH_NOT_OPENED'),
    );
    expect(fx.audit.actions).not.toContain('MONTH_CLOSED');
  });

  it('is the superadmin’s alone once the handover days are over', async () => {
    const fx = await booksOn('2026-10-06');

    await expect(fx.close.execute(owner(501), m('2026-08'))).rejects.toThrow(
      withCode('OUTSIDE_WRITE_WINDOW'),
    );
    await fx.close.execute(admin, m('2026-08'));
    expect((await fx.view.execute(admin, m('2026-08'))).status).toBe('CLOSED');
  });

  it('is offered only to whoever can close the month now', async () => {
    const fx = await booksOn('2026-10-02');
    const canClose = async (actor: typeof admin, month: string) =>
      (await fx.view.execute(actor, m(month))).canClose;

    expect(await canClose(owner(501), '2026-08')).toBe(true);
    expect(await canClose(owner(501), '2026-09')).toBe(false); // August first
    expect(await canClose(owner(502), '2026-08')).toBe(false);
    expect(await canClose(owner(502), '2026-10')).toBe(false); // still October
  });
});

describe('ReopenMonth', () => {
  it('lets the superadmin fix a closed month; closing it again restates the later ones', async () => {
    const fx = booksFixture('2026-10-03');
    await fx.setStart.execute(admin, start);
    await fx.open.execute(admin, m('2026-10'));
    await fx.add.execute(admin, payment('2026-09-05', 401, 700));
    await fx.close.execute(admin, m('2026-08'));
    await fx.close.execute(admin, m('2026-09'));
    expect((await fx.view.execute(admin, m('2026-09'))).canReopen).toBe(true);
    expect((await fx.view.execute(owner(501), m('2026-09'))).canReopen).toBe(false);

    // A $700 payment forgotten in August.
    await fx.reopen.execute(admin, m('2026-08'));
    await fx.add.execute(admin, payment('2026-08-20', 402, 700));
    await fx.close.execute(admin, m('2026-08'));

    expect(fx.audit.actions.slice(-4)).toEqual([
      'MONTH_REOPENED',
      'CASH_MOVEMENT_ADDED',
      'MONTH_CLOSED',
      'MONTH_RESTATED',
    ]);
    expect(fx.audit.entries.at(-1)?.change.changes).toEqual([
      { field: 'openingBalance', before: 500000, after: 570000 },
      { field: 'closingBalance', before: 570000, after: 640000 },
    ]);
    const october = await fx.view.execute(admin, m('2026-10'));
    expect(october.balances?.opening).toEqual(pesos(6400));
  });

  it('is for the superadmin, on a closed month', async () => {
    const fx = booksFixture('2026-10-03');
    await fx.setStart.execute(admin, start);
    await fx.open.execute(admin, m('2026-08'));

    await expect(fx.reopen.execute(owner(501), m('2026-08'))).rejects.toThrow(
      withCode('SUPERADMIN_ONLY'),
    );
    await expect(fx.reopen.execute(admin, m('2026-08'))).rejects.toThrow(
      withCode('MONTH_NOT_CLOSED'),
    );
    await expect(fx.reopen.execute(admin, m('2026-09'))).rejects.toThrow(
      withCode('REPORT_NOT_FOUND'),
    );
  });
});

describe('GetMonthHistory', () => {
  it('is empty until the books start', async () => {
    const fx = booksFixture('2026-10-02');
    expect(await fx.history.execute(owner(502))).toEqual({ reportingStarted: false, months: [] });
    await fx.setStart.execute(admin, start);
    expect(await fx.history.execute(owner(502))).toEqual({ reportingStarted: true, months: [] });
  });

  it('lists every opened month newest first, frozen once closed and live while open', async () => {
    const fx = booksFixture('2026-10-02');
    await fx.setStart.execute(admin, start);
    await fx.open.execute(admin, m('2026-10'));
    await fx.add.execute(admin, payment('2026-08-05', 401, 700));
    await fx.close.execute(admin, m('2026-08'));
    await fx.add.execute(owner(502), payment('2026-10-01', 402, 700));
    await fx.add.execute(owner(502), expense('2026-10-01', 'CLEANING', 270));

    const { months } = await fx.history.execute(owner(501));

    expect(
      months.map((e) => [
        String(e.month),
        e.status,
        e.openingBalance.toString(),
        e.income.toString(),
        e.expense.toString(),
        e.closingBalance.toString(),
        e.canClose,
        e.canReopen,
      ]),
    ).toEqual([
      ['2026-10', 'OPEN', '5700.00', '700.00', '270.00', '6130.00', false, false],
      ['2026-09', 'OPEN', '5700.00', '0.00', '0.00', '5700.00', true, false],
      ['2026-08', 'CLOSED', '5000.00', '700.00', '0.00', '5700.00', false, false],
    ]);
    expect((await fx.history.execute(admin)).months.map((e) => e.canReopen)).toEqual([
      false,
      false,
      true,
    ]);
  });
});

describe('OpenCurrentMonth', () => {
  it('opens the month, and any earlier one, if nobody did, as the system', async () => {
    const fx = booksFixture('2026-10-01');
    expect(await fx.openCurrent.execute()).toEqual([]);
    await fx.setStart.execute(admin, start);

    const opened = await fx.openCurrent.execute();

    expect(opened.map((report) => String(report.month))).toEqual(['2026-08', '2026-09', '2026-10']);
    expect(fx.charges.summary()).toHaveLength(30);
    const byTheSystem = fx.audit.entries.filter((entry) => entry.actor.role === 'SYSTEM');
    expect(byTheSystem.map((entry) => entry.change.action)).toEqual([
      'MONTH_OPENED',
      ...Array<string>(10).fill('CHARGE_ADDED'),
      'MONTH_OPENED',
      ...Array<string>(10).fill('CHARGE_ADDED'),
      'MONTH_OPENED',
      ...Array<string>(10).fill('CHARGE_ADDED'),
    ]);
    expect(await fx.openCurrent.execute()).toEqual([]);
  });

  it('waits while the books start in a later month', async () => {
    const fx = booksFixture('2026-10-01');
    await fx.setStart.execute(admin, { month: m('2026-11'), openingBalance: Money.ZERO });
    expect(await fx.openCurrent.execute()).toEqual([]);
  });
});

describe('RenderMonthlyReport', () => {
  /** September's books, closed on 3 October; 402 pays more in October. */
  async function september() {
    const fx = booksFixture('2026-10-03');
    await fx.setStart.execute(admin, start);
    await fx.open.execute(admin, m('2026-10'));
    for (const row of [
      payment('2026-09-05', 401, 1400),
      payment('2026-09-10', 402, 1000),
      payment('2026-09-30', 501, 2800),
      garbage('2026-09-05', '2026-08-31'),
      expense('2026-09-01', 'CLEANING', 270),
      expense('2026-09-03', 'CLEANING', 270),
      expense('2026-09-08', 'CLEANING', 270),
      otherIncome('2026-09-12', 500, 'Cooperación'),
      expense('2026-09-20', 'OTHER_EXPENSE', 120, 'Focos'),
    ]) {
      await fx.add.execute(admin, row);
    }
    await fx.close.execute(admin, m('2026-08'));
    await fx.close.execute(admin, m('2026-09'));
    await fx.add.execute(admin, payment('2026-10-01', 402, 400));
    return fx;
  }

  it('gathers the month’s figures, rows and accounts for the renderer', async () => {
    const fx = await september();

    const bytes = await fx.pdf.execute(m('2026-09'));

    expect(new TextDecoder().decode(bytes)).toBe('2026-09');
    const [doc] = fx.renderer.documents;
    expect(doc).toMatchObject({
      status: 'CLOSED',
      days: null,
      administration: {
        scheduledUnit: UnitNumber.of(501),
        responsibleUnits: [UnitNumber.of(501)],
      },
      openingBalance: pesos(5000),
      income: pesos(5700),
      expense: pesos(1080),
      closingBalance: pesos(9620),
    });
    expect(doc?.otherIncome.map((e) => [e.description, e.amount])).toEqual([
      ['Cooperación', pesos(500)],
    ]);
    // The week paid, then the month's weeks nobody paid (blank in the report).
    expect(doc?.garbage.map((e) => [String(e.week), e.amount])).toEqual([
      ['2026-08-31', pesos(150)],
      ['2026-09-07', null],
      ['2026-09-14', null],
      ['2026-09-21', null],
    ]);
    expect(doc?.maintenanceFee).toEqual(pesos(700));
    expect(doc?.otherExpenses.map((e) => e.description)).toEqual(['Focos']);
    expect(doc?.cleaning.map((w) => [String(w.weekStart), w.dates.length, w.total])).toEqual([
      ['2026-08-31', 2, pesos(540)],
      ['2026-09-07', 1, pesos(270)],
    ]);
  });

  it('shows each depto’s account as it stood when the month ended', async () => {
    const fx = await september();

    const { units } = await fx.pdf.document(m('2026-09'));

    const line = (unit: number) => {
      const found = units.find((u) => u.unit.value === unit)!;
      return {
        paid: found.paid.toString(),
        covered: found.covered.map((c) => `${String(c.month)}${c.settles ? '' : ' parcial'}`),
        owed: found.owed.map((o) => `${String(o.month)} ${o.amount.toString()}`),
        outstanding: found.outstanding.toString(),
        credit: found.credit.toString(),
      };
    };
    expect(line(401)).toEqual({
      paid: '1400.00',
      covered: ['2026-08', '2026-09'],
      owed: [],
      outstanding: '0.00',
      credit: '0.00',
    });
    // October's $400 does not change September's report.
    expect(line(402)).toMatchObject({
      covered: ['2026-08', '2026-09 parcial'],
      owed: ['2026-09 400.00'],
      outstanding: '400.00',
    });
    // Paid ahead in September: October's fee did not exist yet, so it is an adelanto.
    expect(line(501)).toMatchObject({ covered: ['2026-08', '2026-09'], credit: '1400.00' });
    expect(line(101)).toMatchObject({ paid: '0.00', outstanding: '1400.00' });
    expect(units.every((u) => u.active)).toBe(true);
    const fee = (unit: number) => units.find((u) => u.unit.value === unit)!.currentFee;
    // 402 paid August first, so only $300 of its September payment went to September.
    expect(fee(402)).toMatchObject({ paidThisMonth: pesos(300), outstanding: pesos(400) });
    expect(units.find((u) => u.unit.value === 501)?.advanced).toEqual(pesos(1400));
    expect(fee(101)).toMatchObject({ paidThisMonth: Money.ZERO, outstanding: pesos(700) });
  });

  it('is a draft while the month is open, and needs the month opened', async () => {
    const fx = await september();

    expect((await fx.pdf.document(m('2026-10'))).status).toBe('OPEN');
    await expect(fx.pdf.execute(m('2026-11'))).rejects.toThrow(withCode('REPORT_NOT_FOUND'));
  });
});

describe('opening balances', () => {
  const august = { month: m('2026-08'), openingBalance: pesos(18_247.02) };
  const debt = (month: string, amount: number, type = 'MAINTENANCE_FEE' as const) => ({
    month: m(month),
    type,
    amount: pesos(amount),
  });
  const u = (n: number) => UnitNumber.of(n);

  it('carries each depto’s debts and adelanto into the books, oldest first', async () => {
    const fx = booksFixture('2026-09-03');
    await fx.setStart.execute(admin, august);
    await fx.setOpening.execute(
      admin,
      u(301),
      [
        debt('2025-08', 600),
        debt('2026-07', 700),
        { ...debt('2026-07', 500), type: 'SHIFT_SKIP_PENALTY' },
      ],
      Money.ZERO,
    );
    await fx.setOpening.execute(admin, u(202), [], pesos(700));
    await fx.open.execute(admin, m('2026-08'));
    await fx.add.execute(admin, payment('2026-08-10', 301, 700));

    const accounts = await fx.accounts.all();
    const account = (n: number) => accounts.find((a) => a.unit === u(n))!;
    // 301's $700 went to the oldest debt: what was left of August 2025, then July 2026.
    expect(
      account(301).lines.map((l) => [
        String(l.charge.month),
        l.charge.type,
        l.outstanding.toString(),
      ]),
    ).toEqual([
      ['2025-08', 'MAINTENANCE_FEE', '0.00'],
      ['2026-07', 'MAINTENANCE_FEE', '600.00'],
      ['2026-07', 'SHIFT_SKIP_PENALTY', '500.00'],
      ['2026-08', 'MAINTENANCE_FEE', '700.00'],
    ]);
    // 202's adelanto paid August.
    expect([account(202).outstandingBalance, account(202).creditBalance]).toEqual([
      Money.ZERO,
      Money.ZERO,
    ]);
    // The cash is the reporting start's: the initial load never moves it.
    expect((await fx.view.execute(admin, m('2026-08'))).balances?.opening).toEqual(
      pesos(18_247.02),
    );

    // In August's report, 202's fee shows as paid before the month.
    const { units } = await fx.pdf.document(m('2026-08'));
    expect(units.find((l) => l.unit === u(202))?.currentFee).toMatchObject({
      paidThisMonth: Money.ZERO,
      paidBefore: pesos(700),
      paidBeforeIn: m('2026-07'),
    });

    const { start, locked, balances } = await fx.getOpening.execute();
    expect([String(start), locked]).toEqual(['2026-08', false]);
    expect(balances.find((b) => b.unit === u(301))?.debt).toEqual(pesos(1800));
    expect(
      fx.audit.entries.find((e) => e.change.action === 'OPENING_BALANCE_SET')?.change,
    ).toMatchObject({
      entity: 'opening_balance',
      entityId: '301',
      changes: [
        {
          field: 'debts',
          before: null,
          after:
            '2025-08 MAINTENANCE_FEE 60000, 2026-07 MAINTENANCE_FEE 70000, 2026-07 SHIFT_SKIP_PENALTY 50000',
        },
      ],
    });
  });

  it('replaces a depto’s balance as a whole, audited only when it changes', async () => {
    const fx = booksFixture('2026-08-03');
    await fx.setStart.execute(admin, august);
    await fx.setOpening.execute(
      admin,
      u(102),
      [debt('2026-06', 700), debt('2026-07', 700)],
      Money.ZERO,
    );
    await fx.setOpening.execute(admin, u(102), [debt('2026-07', 700)], pesos(100));
    await fx.setOpening.execute(admin, u(102), [debt('2026-07', 700)], pesos(100));

    expect(fx.charges.summary().filter((c) => c.startsWith('102'))).toEqual([
      '102:2026-07:MAINTENANCE_FEE 70000',
    ]);
    expect(fx.audit.actions.filter((a) => a === 'OPENING_BALANCE_SET')).toHaveLength(2);
    await fx.setOpening.execute(admin, u(102), [], Money.ZERO);
    expect((await fx.getOpening.execute()).balances.every((b) => b.isEmpty)).toBe(true);
  });

  it('is the superadmin’s, before the start, and frozen once the first month closes', async () => {
    const fx = booksFixture('2026-09-03');
    await expect(fx.setOpening.execute(admin, u(102), [], pesos(1))).rejects.toThrow(
      withCode('REPORTING_NOT_STARTED'),
    );
    await fx.setStart.execute(admin, august);
    await expect(fx.setOpening.execute(owner(501), u(102), [], pesos(1))).rejects.toThrow(
      withCode('SUPERADMIN_ONLY'),
    );
    await expect(
      fx.setOpening.execute(admin, u(102), [debt('2026-08', 700)], Money.ZERO),
    ).rejects.toThrow(withCode('OPENING_CHARGE_NOT_BEFORE_START'));

    await fx.setOpening.execute(admin, u(102), [debt('2026-07', 700)], Money.ZERO);
    await expect(fx.setStart.execute(admin, { ...august, month: m('2026-09') })).rejects.toThrow(
      withCode('OPENING_BALANCES_SET'),
    );

    await fx.open.execute(admin, m('2026-08'));
    await fx.close.execute(admin, m('2026-08'));
    expect((await fx.getOpening.execute()).locked).toBe(true);
    await expect(fx.setOpening.execute(admin, u(102), [], Money.ZERO)).rejects.toThrow(
      withCode('OPENING_BALANCE_LOCKED'),
    );
  });
});
