import { describe, expect, it } from 'vitest';
import { withCode } from '../../../../test/support/domain-error.js';
import { LocalDate, UnitNumber } from '../../../shared-kernel/index.js';
import { expense, garbage, payment } from '../../cashbook/domain/testing.js';
import { admin, owner } from '../../shifts/application/testing.js';
import { m, note, pesos, sheetDetails } from '../domain/testing.js';
import { historyFile, historyFixture } from './testing.js';

const d = (text: string) => LocalDate.parse(text);

/** May 2022 as its paper says, a June with only rows, and a July with no paper at all. */
const file = () =>
  historyFile(
    {
      '2022-05': {
        sheets: [
          {
            ...sheetDetails('2022-05'),
            figures: {
              opening: pesos(712.25),
              income: pesos(1200),
              expense: pesos(150),
              closing: pesos(1762.25),
            },
            lines: [note(301, 'PAGÓ EN JULIO 2022')],
            alerts: ['Cuota de $600 más $100 de administración fuera de la caja'],
          },
        ],
        movements: [
          payment('2022-05-01', 101, 600),
          payment('2022-05-01', 102, 600),
          garbage('2022-05-14', '2022-05-09'),
        ],
      },
      '2022-06': { movements: [expense('2022-06-13', 'OTHER_EXPENSE', 511, 'LUZ')] },
      '2022-07': {},
    },
    pesos(712.25),
    {
      owners: { 101: 'NOMBRE DE PRUEBA' },
      rates: (
        ['maintenanceFee', 'cleaningPerVisit', 'garbageWeekly', 'shiftSkipPenalty'] as const
      ).map((rate) => ({ rate, effectiveFrom: d('2022-05-01'), amount: pesos(600) })),
    },
  );

async function imported() {
  const fx = historyFixture();
  await fx.import.execute(admin, file());
  return fx;
}

describe('importing the history', () => {
  it('is for the superadmin only', async () => {
    const fx = historyFixture();
    await expect(fx.preview.execute(owner(501), file())).rejects.toThrow(
      withCode('SUPERADMIN_ONLY'),
    );
    await expect(fx.import.execute(owner(501), file())).rejects.toThrow(
      withCode('SUPERADMIN_ONLY'),
    );
    await expect(fx.get.execute(owner(501))).rejects.toThrow(withCode('SUPERADMIN_ONLY'));
  });

  it('previews what would come in without saving anything', async () => {
    const fx = historyFixture();
    const preview = await fx.preview.execute(admin, file());

    expect(
      preview.months.map(({ review }) => [String(review.month), review.closing.toString()]),
    ).toEqual([
      ['2022-05', '1762.25'],
      ['2022-06', '1251.25'],
      ['2022-07', '1251.25'],
    ]);
    expect(String(preview.cutover)).toBe('2022-08');
    expect(preview).toMatchObject({ closing: pesos(1251.25), movements: 4 });
    expect(preview.owners).toHaveLength(1);
    expect(await fx.getStart.execute()).toBeNull();
  });

  it('starts the books with it: every month open, its rows in the cashbook, nothing audited', async () => {
    const fx = await imported();

    expect(await fx.getStart.execute()).toEqual({
      month: m('2022-05'),
      openingBalance: pesos(712.25),
      cutover: m('2022-08'),
    });
    const may = await fx.view.execute(admin, m('2022-05'));
    expect(may).toMatchObject({ status: 'OPEN', historical: true });
    expect(may.rows.map((row) => row.movement.category)).toEqual([
      'UNIT_PAYMENT',
      'UNIT_PAYMENT',
      'GARBAGE',
    ]);
    // Its rates prefill the forms of its months.
    expect(may.suggestions?.maintenanceFee).toEqual(pesos(600));
    expect(fx.charges.summary()).toEqual([]);
    // The owners' names are the current roster, not history: those are audited.
    expect(fx.audit.entries.map((entry) => entry.change.action)).toEqual(['UNIT_OWNER_RENAMED']);
    expect((await fx.unitRepository.findByNumber(UnitNumber.of(101)))!.ownerName).toBe(
      'NOMBRE DE PRUEBA',
    );
  });

  it('comes in only before the books start', async () => {
    const fx = await imported();
    await expect(fx.preview.execute(admin, file())).rejects.toThrow(
      withCode('BOOKS_ALREADY_STARTED'),
    );
    await expect(fx.import.execute(admin, file())).rejects.toThrow(
      withCode('BOOKS_ALREADY_STARTED'),
    );
  });

  it('refuses a file that does not hold together, saving nothing', async () => {
    const fx = historyFixture();
    const misplaced = historyFile(
      { '2022-05': { movements: [expense('2022-06-01', 'OTHER_EXPENSE', 10, 'X')] } },
      pesos(0),
    );
    await expect(fx.import.execute(admin, misplaced)).rejects.toThrow(
      withCode('HISTORY_FILE_INVALID'),
    );
    const twice = historyFile(
      {
        '2022-05': {
          movements: [garbage('2022-05-13', '2022-05-09'), garbage('2022-05-14', '2022-05-09')],
        },
      },
      pesos(0),
    );
    await expect(fx.import.execute(admin, twice)).rejects.toThrow(withCode('GARBAGE_WEEK_PAID'));
    const sameDay = historyFile(
      { '2022-05': { sheets: [sheetDetails('2022-05'), sheetDetails('2022-05')] } },
      pesos(0),
    );
    await expect(fx.import.execute(admin, sameDay)).rejects.toThrow(withCode('SHEET_DUPLICATED'));
    const repeated = historyFile({ '2022-05': {} }, pesos(0));
    await expect(
      fx.import.execute(admin, { ...repeated, months: [...repeated.months, ...repeated.months] }),
    ).rejects.toThrow(withCode('HISTORY_FILE_INVALID'));
    await expect(fx.import.execute(admin, historyFile({}, pesos(0)))).rejects.toThrow(
      withCode('HISTORY_FILE_INVALID'),
    );
    expect(await fx.getStart.execute()).toBeNull();
  });
});

describe('reviewing the history', () => {
  it('puts every month next to its paper, with the balance carried into it', async () => {
    const fx = await imported();
    const history = (await fx.get.execute(admin))!;

    expect([history.firstMonth, history.lastMonth, history.cutover].map(String)).toEqual([
      '2022-05',
      '2022-07',
      '2022-08',
    ]);
    const [may, june, july] = history.months;
    expect(may).toMatchObject({ status: 'OPEN' });
    expect(may!.review).toMatchObject({
      income: pesos(1200),
      paperClosing: pesos(1762.25),
      paperIncome: pesos(1200),
    });
    expect(june!.review).toMatchObject({ opening: pesos(1762.25), sheets: [] });
    expect(july!.review.closing).toEqual(pesos(1251.25));
    expect(history.closing).toEqual(pesos(1251.25));
  });

  it('shows one month to everyone, editable by the superadmin while it is open', async () => {
    const fx = await imported();
    const may = await fx.month.execute(owner(501), m('2022-05'));
    expect(may.canEdit).toBe(false);
    expect(may.review.sheets[0]!.details.lines[0]!.text).toBe('PAGÓ EN JULIO 2022');
    expect((await fx.month.execute(admin, m('2022-05'))).canEdit).toBe(true);

    await fx.close.execute(admin, m('2022-05'));
    expect((await fx.month.execute(admin, m('2022-05'))).canEdit).toBe(false);
    await expect(fx.month.execute(admin, m('2022-08'))).rejects.toThrow(
      withCode('MONTH_NOT_HISTORY'),
    );
  });

  it('is nothing until the books start with a history', async () => {
    const fx = historyFixture();
    expect(await fx.get.execute(admin)).toBeNull();
    await fx.setStart.execute(admin, { month: m('2026-08'), openingBalance: pesos(0) });
    await fx.open.execute(admin, m('2026-08'));
    expect(await fx.get.execute(admin)).toBeNull();
  });

  it('gives the report the sheets of a month', async () => {
    const fx = await imported();
    const [page] = await fx.paperRecord.pagesOf(m('2022-05'));
    expect(page).toMatchObject({ fromDay: 1, lines: [note(301, 'PAGÓ EN JULIO 2022')] });
    expect(await fx.paperRecord.pagesOf(m('2022-06'))).toEqual([]);
  });
});

describe('correcting the paper sheets', () => {
  it('adds a sheet found later, corrects it and removes it', async () => {
    const fx = await imported();
    const october = sheetDetails('2022-07', {
      figures: { opening: pesos(1251.25), income: pesos(3054), expense: null, closing: null },
    });
    const sheet = await fx.addSheet.execute(admin, october);
    expect((await fx.month.execute(admin, m('2022-07'))).review.paperIncome).toEqual(pesos(3054));

    await expect(fx.addSheet.execute(admin, october)).rejects.toThrow(withCode('SHEET_DUPLICATED'));
    await fx.reviseSheet.execute(admin, sheet.id, {
      ...october,
      lines: [{ ...note(202, 'ADEUDA JULIO'), ownerName: 'NOMBRE' }],
    });
    const [revised] = (await fx.month.execute(admin, m('2022-07'))).review.sheets;
    expect(revised!.details.lines[0]).toMatchObject({ ownerName: 'NOMBRE', text: 'ADEUDA JULIO' });

    await fx.removeSheet.execute(admin, sheet.id);
    expect((await fx.month.execute(admin, m('2022-07'))).review.sheets).toEqual([]);
    await expect(fx.removeSheet.execute(admin, sheet.id)).rejects.toThrow(
      withCode('SHEET_NOT_FOUND'),
    );
    // Like the rows of the history, outside the audit log.
    expect(fx.audit.actions).toEqual(['UNIT_OWNER_RENAMED']);
  });

  it('is for the superadmin, in an open month of the history', async () => {
    const fx = await imported();
    await expect(fx.addSheet.execute(owner(501), sheetDetails('2022-07'))).rejects.toThrow(
      withCode('SUPERADMIN_ONLY'),
    );
    await fx.close.execute(admin, m('2022-05'));
    await expect(
      fx.addSheet.execute(admin, sheetDetails('2022-05', { fromDay: 11 })),
    ).rejects.toThrow(withCode('MONTH_CLOSED'));
    await expect(fx.addSheet.execute(admin, sheetDetails('2022-08'))).rejects.toThrow(
      withCode('MONTH_NOT_HISTORY'),
    );
    await expect(historyFixture().addSheet.execute(admin, sheetDetails('2022-05'))).rejects.toThrow(
      withCode('MONTH_NOT_HISTORY'),
    );
  });

  it('records the rows of the history in the cashbook, outside the audit log', async () => {
    const fx = await imported();
    await fx.add.execute(admin, expense('2022-07-20', 'OTHER_EXPENSE', 26, 'FABULOSO 1LT'));
    expect(fx.audit.actions).toEqual(['UNIT_OWNER_RENAMED']);
    const july = (await fx.get.execute(admin))!.months[2]!;
    expect(july.review.expense).toEqual(pesos(26));
  });
});
