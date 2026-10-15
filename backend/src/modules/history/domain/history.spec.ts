import { describe, expect, it } from 'vitest';
import { withCode } from '../../../../test/support/domain-error.js';
import { Instant, UnitNumber } from '../../../shared-kernel/index.js';
import { HistoricalBooks } from './historical-books.js';
import { assertWeekUnpaid } from './historical-movement.js';
import { carriedGap, ownGap, reviewHistory } from './history-review.js';
import { PaperSheet } from './paper-sheet.js';
import { garbage, m, paid, pesos, row, sheet, sheetDetails, spent } from './testing.js';

const books = (first = '2022-05', last = '2022-07', opening = 712.25) =>
  HistoricalBooks.start(m(first), m(last), pesos(opening));

describe('HistoricalBooks', () => {
  it('spans its months in order, including those without a sheet', () => {
    expect(books().months.map(String)).toEqual(['2022-05', '2022-06', '2022-07']);
    expect(books().covers(m('2022-06'))).toBe(true);
    expect(books().covers(m('2022-08'))).toBe(false);
    expect(() => books().assertCovers(m('2022-04'))).toThrow(withCode('HISTORY_MONTH_OUTSIDE'));
  });

  it('cannot end before it begins', () => {
    expect(() => books('2022-07', '2022-05')).toThrow(withCode('HISTORY_SPAN_INVALID'));
  });

  it('is in review until verified, and frozen after', () => {
    expect(books().status).toBe('IN_REVIEW');
    expect(() => books().assertInReview()).not.toThrow();
    const verified = HistoricalBooks.restore(
      m('2022-05'),
      m('2022-07'),
      pesos(0),
      Instant.ofEpochMillis(0),
    );
    expect(verified.status).toBe('VERIFIED');
    expect(() => verified.assertInReview()).toThrow(withCode('HISTORY_VERIFIED'));
  });

  it('ends before the live books start', () => {
    expect(() => books().assertEndsBefore(m('2022-08'))).not.toThrow();
    expect(() => books().assertEndsBefore(m('2022-07'))).toThrow(
      withCode('HISTORY_OVERLAPS_BOOKS'),
    );
  });
});

describe('PaperSheet', () => {
  it('starts on a day of its month', () => {
    expect(() => PaperSheet.create('s', sheetDetails('2023-02', { fromDay: 11 }))).not.toThrow();
    expect(() => PaperSheet.create('s', sheetDetails('2023-02', { fromDay: 29 }))).toThrow(
      withCode('SHEET_DAY_INVALID'),
    );
    expect(() => PaperSheet.create('s', sheetDetails('2023-02', { fromDay: 0 }))).toThrow(
      withCode('SHEET_DAY_INVALID'),
    );
  });

  it('says where it comes from', () => {
    expect(() => PaperSheet.create('s', sheetDetails('2023-02', { source: '  ' }))).toThrow(
      withCode('SHEET_SOURCE_INVALID'),
    );
  });

  it('keeps a negative balance (April 2023 closed in the red) but not negative totals', () => {
    const red = { opening: pesos(514.5), income: null, expense: null, closing: pesos(-1506.81) };
    expect(() => PaperSheet.create('s', sheetDetails('2023-04', { figures: red }))).not.toThrow();
    const wrong = { ...red, expense: pesos(-1) };
    expect(() => PaperSheet.create('s', sheetDetails('2023-04', { figures: wrong }))).toThrow(
      withCode('SHEET_FIGURES_INVALID'),
    );
  });

  it('trims its texts, drops empty ones and orders the observations by depto', () => {
    const created = PaperSheet.create(
      's',
      sheetDetails('2022-05', {
        alerts: ['  falta la hoja  ', ' '],
        notes: [
          { unit: UnitNumber.of(401), text: ' PAGÓ EN AGOSTO 2022 ' },
          { unit: UnitNumber.of(202), text: 'ADELANTÓ JUNIO 2022' },
          { unit: UnitNumber.of(301), text: '' },
        ],
      }),
    );
    expect(created.details.alerts).toEqual(['falta la hoja']);
    expect(created.details.notes.map((note) => [note.unit.value, note.text])).toEqual([
      [202, 'ADELANTÓ JUNIO 2022'],
      [401, 'PAGÓ EN AGOSTO 2022'],
    ]);
  });

  it('has one observation per depto and bounded texts', () => {
    const twice = [
      { unit: UnitNumber.of(101), text: 'A' },
      { unit: UnitNumber.of(101), text: 'B' },
    ];
    expect(() => PaperSheet.create('s', sheetDetails('2022-05', { notes: twice }))).toThrow(
      withCode('SHEET_NOTES_DUPLICATED'),
    );
    expect(() =>
      PaperSheet.create('s', sheetDetails('2022-05', { alerts: ['x'.repeat(501)] })),
    ).toThrow(withCode('SHEET_TEXT_TOO_LONG'));
  });

  it('is corrected in place and stays in its month', () => {
    const corrected = sheet('2022-05', 712.25, 3662.25);
    corrected.revise({ ...sheetDetails('2022-06'), source: 'foto 55' });
    expect(String(corrected.month)).toBe('2022-05');
    expect(corrected.details.source).toBe('foto 55');
  });
});

describe('HistoricalMovement', () => {
  it('follows the same rules as a live row', () => {
    expect(() => row({ ...spent('2022-06-13', 511), description: ' ' })).toThrow(
      withCode('MOVEMENT_DESCRIPTION_REQUIRED'),
    );
    expect(() => row({ ...paid('2022-06-01', 101), unit: null })).toThrow(
      withCode('MOVEMENT_UNIT_REQUIRED'),
    );
  });

  it('is revised as a whole and stays valid', () => {
    const light = row(spent('2022-06-13', 511));
    light.revise(spent('2022-06-14', 512, 'PAGO DE LUZ'));
    expect(light.details).toMatchObject({ description: 'PAGO DE LUZ' });
    expect(light.signedAmount).toEqual(pesos(-512));
    expect(() => light.revise({ ...spent('2022-06-14', 0) })).toThrow(
      withCode('MOVEMENT_AMOUNT_INVALID'),
    );
  });

  it('pays each week of garbage once', () => {
    const first = row(garbage('2022-05-14'));
    expect(() => assertWeekUnpaid(row(garbage('2022-05-13')), [first])).toThrow(
      withCode('GARBAGE_WEEK_PAID'),
    );
    expect(() => assertWeekUnpaid(first, [first])).not.toThrow();
    expect(() => assertWeekUnpaid(row(garbage('2022-05-21')), [first])).not.toThrow();
    expect(() => assertWeekUnpaid(row(paid('2022-05-01', 101)), [first])).not.toThrow();
  });
});

describe('reviewHistory', () => {
  const rows = [
    row(paid('2022-05-01', 101, 600)),
    row(garbage('2022-05-14')),
    row(spent('2022-06-13', 511)),
    row(paid('2022-06-01', 102, 600)),
  ];

  it('chains the months from the opening cash, like the live books', () => {
    const [may, june, july] = reviewHistory(books(), [], rows);
    expect(may).toMatchObject({ opening: pesos(712.25), income: pesos(600), expense: pesos(150) });
    expect(may!.closing).toEqual(pesos(1162.25));
    expect(june!.opening).toEqual(may!.closing);
    expect(june!.closing).toEqual(pesos(1251.25));
    expect(june!.movements.map((movement) => String(movement.date))).toEqual([
      '2022-06-01',
      '2022-06-13',
    ]);
    // A month without paper or rows still counts: it carries the balance unchanged.
    expect(july).toMatchObject({ sheets: [], paperOpening: null, paperClosing: null });
    expect(july!.closing).toEqual(june!.closing);
  });

  it('puts each month next to its paper: the first sheet opens it, the last one closes it', () => {
    const second = sheet('2022-05', 1000, 1162.25, { fromDay: 11 });
    const first = sheet('2022-05', 712.25, 1000);
    const june = sheet('2022-06', 1162.25, 1300);
    const [may, juneReview] = reviewHistory(books(), [second, june, first], rows);
    expect(may!.sheets).toEqual([first, second]);
    expect(carriedGap(may!)).toEqual(pesos(0));
    expect(ownGap(may!)).toEqual(pesos(0));
    // June's rows move $48.75 less than its paper says; it inherits nothing.
    expect(ownGap(juneReview!)).toEqual(pesos(-48.75));
    expect(carriedGap(juneReview!)).toEqual(pesos(0));
  });

  it('adds up what the sheets of a month take in and pay out', () => {
    const figures = (income: number | null, expense: number) => ({
      opening: null,
      income: income === null ? null : pesos(income),
      expense: pesos(expense),
      closing: null,
    });
    const first = sheet('2022-05', null, null, { figures: figures(600, 150) });
    const second = sheet('2022-05', null, null, { fromDay: 11, figures: figures(700, 0) });
    const [may, june] = reviewHistory(books(), [first, second], rows);
    expect(may).toMatchObject({ paperIncome: pesos(1300), paperExpense: pesos(150) });
    // Unknown without paper, or when a sheet does not say.
    expect(june).toMatchObject({ paperIncome: null, paperExpense: null });
    const unread = sheet('2022-05', null, null, { fromDay: 11, figures: figures(null, 0) });
    const [partial] = reviewHistory(books(), [first, unread], rows);
    expect(partial).toMatchObject({ paperIncome: null, paperExpense: pesos(150) });
  });

  it('tells what a month inherits apart from its own difference', () => {
    // The paper of June opens $100 above what May's rows leave: a row of May is missing.
    const [, june] = reviewHistory(books(), [sheet('2022-06', 1262.25, 1351.25)], rows);
    expect(carriedGap(june!)).toEqual(pesos(-100));
    expect(ownGap(june!)).toEqual(pesos(0));
  });

  it('has nothing to compare where the paper gives no figure', () => {
    const [may] = reviewHistory(books(), [sheet('2022-05', 712.25, null)], rows);
    expect(carriedGap(may!)).toEqual(pesos(0));
    expect(ownGap(may!)).toBeNull();
    const [unread] = reviewHistory(books(), [sheet('2022-05', null, null)], rows);
    expect(carriedGap(unread!)).toBeNull();
  });
});
