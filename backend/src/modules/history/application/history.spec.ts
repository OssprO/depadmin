import { describe, expect, it } from 'vitest';
import { withCode } from '../../../../test/support/domain-error.js';
import { Instant, UnitNumber } from '../../../shared-kernel/index.js';
import { admin, owner } from '../../shifts/application/testing.js';
import { HistoricalBooks } from '../domain/index.js';
import { d, garbage, m, paid, pesos, sheetDetails, spent } from '../domain/testing.js';
import { historyFile, historyFixture } from './testing.js';

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
            notes: [{ unit: UnitNumber.of(301), text: 'PAGÓ EN JULIO 2022' }],
            alerts: ['Cuota de $600 más $100 de administración fuera de la caja'],
          },
        ],
        movements: [
          paid('2022-05-01', 101, 600),
          paid('2022-05-01', 102, 600),
          garbage('2022-05-14'),
        ],
      },
      '2022-06': { movements: [spent('2022-06-13', 511)] },
      '2022-07': {},
    },
    pesos(712.25),
    { 101: 'EMMANUEL NAREDO FERNANDEZ' },
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

    expect(preview.months.map((month) => [String(month.month), month.closing])).toEqual([
      ['2022-05', pesos(1762.25)],
      ['2022-06', pesos(1251.25)],
      ['2022-07', pesos(1251.25)],
    ]);
    expect(preview.closing).toEqual(pesos(1251.25));
    expect(preview.owners).toHaveLength(1);
    expect(await fx.get.execute(admin)).toBeNull();
  });

  it('brings the months in, all at once and outside the audit log', async () => {
    const fx = await imported();

    const history = (await fx.get.execute(admin))!;
    expect(history.books.status).toBe('IN_REVIEW');
    expect(String(history.books.firstMonth)).toBe('2022-05');
    expect(String(history.books.lastMonth)).toBe('2022-07');
    expect(history.months[0]!.movements).toHaveLength(3);
    expect(history.months[0]!.sheets[0]!.details.notes[0]!.text).toBe('PAGÓ EN JULIO 2022');
    expect(await fx.boundary.lastMonth()).toEqual(m('2022-07'));
    // The owners' names are the current roster, not history: those are audited.
    expect(fx.audit.entries.map((entry) => entry.change.action)).toEqual(['UNIT_OWNER_RENAMED']);
    expect((await fx.units.findByNumber(UnitNumber.of(101)))!.ownerName).toBe(
      'EMMANUEL NAREDO FERNANDEZ',
    );
  });

  it('happens once; a corrected file replaces it after discarding the first', async () => {
    const fx = await imported();
    await expect(fx.import.execute(admin, file())).rejects.toThrow(
      withCode('HISTORY_ALREADY_IMPORTED'),
    );

    await fx.discard.execute(admin);
    expect(await fx.get.execute(admin)).toBeNull();
    expect(await fx.repository.findMovements()).toEqual([]);
    await fx.import.execute(admin, file());
  });

  it('ends before the live books start', async () => {
    const fx = historyFixture();
    await fx.setStart('2022-07', pesos(0));
    await expect(fx.preview.execute(admin, file())).rejects.toThrow(
      withCode('HISTORY_OVERLAPS_BOOKS'),
    );
    await expect(fx.import.execute(admin, file())).rejects.toThrow(
      withCode('HISTORY_OVERLAPS_BOOKS'),
    );
  });

  it('refuses a file that does not hold together, saving nothing', async () => {
    const fx = historyFixture();
    const misplaced = historyFile(
      { '2022-05': { movements: [spent('2022-06-01', 10)] } },
      pesos(0),
    );
    await expect(fx.import.execute(admin, misplaced)).rejects.toThrow(
      withCode('HISTORY_FILE_INVALID'),
    );
    const twice = historyFile(
      { '2022-05': { movements: [garbage('2022-05-13'), garbage('2022-05-14')] } },
      pesos(0),
    );
    await expect(fx.import.execute(admin, twice)).rejects.toThrow(withCode('GARBAGE_WEEK_PAID'));
    const sameDay = historyFile(
      { '2022-05': { sheets: [sheetDetails('2022-05'), sheetDetails('2022-05')] } },
      pesos(0),
    );
    await expect(fx.import.execute(admin, sameDay)).rejects.toThrow(withCode('SHEET_DUPLICATED'));
    await expect(fx.import.execute(admin, historyFile({}, pesos(0)))).rejects.toThrow(
      withCode('HISTORY_FILE_INVALID'),
    );
    expect(await fx.get.execute(admin)).toBeNull();
  });
});

describe('reviewing the history', () => {
  it('shows a month with its paper, its rows and the balance carried into it', async () => {
    const fx = await imported();
    const { month } = await fx.month.execute(admin, m('2022-06'));

    expect(month.opening).toEqual(pesos(1762.25));
    expect(month.movements.map((row) => row.details.description)).toEqual(['LUZ']);
    expect(month.sheets).toEqual([]);
    await expect(fx.month.execute(admin, m('2022-08'))).rejects.toThrow(
      withCode('HISTORY_MONTH_OUTSIDE'),
    );
  });

  it('compares its last month with the cash the live books start with', async () => {
    const fx = await imported();
    expect((await fx.get.execute(admin))!.cutover).toBeNull();

    await fx.setStart('2022-08', pesos(1300));
    expect((await fx.get.execute(admin))!.cutover).toEqual({
      month: m('2022-08'),
      openingBalance: pesos(1300),
      difference: pesos(48.75),
    });

    // With months in between there is nothing to compare.
    await fx.setStart('2022-10', pesos(1300));
    expect((await fx.get.execute(admin))!.cutover?.difference).toBeNull();
  });

  it('needs a history to look at', async () => {
    const fx = historyFixture();
    await expect(fx.month.execute(admin, m('2022-05'))).rejects.toThrow(
      withCode('HISTORY_NOT_IMPORTED'),
    );
  });
});

describe('correcting the history', () => {
  it('adds, fixes and removes rows within its months', async () => {
    const fx = await imported();
    const light = await fx.addMovement.execute(admin, spent('2022-07-20', 450));
    await fx.reviseMovement.execute(admin, light.id, spent('2022-07-21', 455, 'LUZ JULIO'));
    expect((await fx.repository.findMovement(light.id))!.details).toMatchObject({
      date: d('2022-07-21'),
      amount: pesos(455),
    });

    await fx.removeMovement.execute(admin, light.id);
    expect(await fx.repository.findMovement(light.id)).toBeNull();
    await expect(fx.removeMovement.execute(admin, light.id)).rejects.toThrow(
      withCode('MOVEMENT_NOT_FOUND'),
    );
    await expect(fx.addMovement.execute(admin, spent('2022-08-01', 10))).rejects.toThrow(
      withCode('HISTORY_MONTH_OUTSIDE'),
    );
    expect(fx.audit.entries.map((entry) => entry.change.action)).toEqual(['UNIT_OWNER_RENAMED']);
  });

  it('pays each week of garbage once', async () => {
    const fx = await imported();
    await expect(fx.addMovement.execute(admin, garbage('2022-05-13'))).rejects.toThrow(
      withCode('GARBAGE_WEEK_PAID'),
    );
    const [paidWeek] = (await fx.repository.findMovements(m('2022-05'))).filter(
      (row) => row.details.week,
    );
    // The row that paid it can still be corrected.
    await fx.reviseMovement.execute(admin, paidWeek!.id, garbage('2022-05-15'));
  });

  it('adds a sheet found later, corrects it and removes it', async () => {
    const fx = await imported();
    const found = await fx.addSheet.execute(admin, {
      ...sheetDetails('2022-07'),
      source: 'foto 53',
      notes: [{ unit: UnitNumber.of(401), text: 'PAGÓ EN AGOSTO 2022' }],
    });
    await expect(fx.addSheet.execute(admin, sheetDetails('2022-07'))).rejects.toThrow(
      withCode('SHEET_DUPLICATED'),
    );
    await expect(fx.addSheet.execute(admin, sheetDetails('2022-09'))).rejects.toThrow(
      withCode('HISTORY_MONTH_OUTSIDE'),
    );

    await fx.reviseSheet.execute(admin, found.id, { ...found.details, fromDay: 10, notes: [] });
    expect((await fx.repository.findSheet(found.id))!.details).toMatchObject({
      fromDay: 10,
      notes: [],
    });
    await fx.removeSheet.execute(admin, found.id);
    await expect(fx.reviseSheet.execute(admin, found.id, found.details)).rejects.toThrow(
      withCode('SHEET_NOT_FOUND'),
    );
  });

  it('is for the superadmin only, and only while in review', async () => {
    const fx = await imported();
    await expect(fx.addMovement.execute(owner(501), spent('2022-07-20', 1))).rejects.toThrow(
      withCode('SUPERADMIN_ONLY'),
    );
    const books = (await fx.repository.loadBooks())!;
    await fx.repository.saveBooks(
      HistoricalBooks.restore(
        books.firstMonth,
        books.lastMonth,
        books.openingBalance,
        Instant.ofEpochMillis(0),
      ),
    );
    await expect(fx.addMovement.execute(admin, spent('2022-07-20', 1))).rejects.toThrow(
      withCode('HISTORY_VERIFIED'),
    );
    await expect(fx.discard.execute(admin)).rejects.toThrow(withCode('HISTORY_VERIFIED'));
  });
});
