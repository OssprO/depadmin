import { describe, expect, it } from 'vitest';
import { withCode } from '../../../../test/support/domain-error.js';
import { carriedGap, chainMonths, ownGap, reviewMonth } from './history-review.js';
import { PaperSheet } from './paper-sheet.js';
import { figures, m, note, pesos, sheet, sheetDetails } from './testing.js';

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

  it('trims its texts, drops empty lines and orders them by depto', () => {
    const created = PaperSheet.create(
      's',
      sheetDetails('2022-05', {
        alerts: ['  falta la hoja  ', ' '],
        lines: [
          { ...note(401, ' PAGÓ EN AGOSTO 2022 '), ownerName: '  ' },
          { ...note(202, 'ADELANTÓ JUNIO 2022'), current: pesos(600), other: pesos(600) },
          note(301, ''),
          { ...note(101, ''), ownerName: ' NOMBRE ' },
        ],
      }),
    );
    expect(created.details.alerts).toEqual(['falta la hoja']);
    expect(
      created.details.lines.map((line) => [line.unit.value, line.ownerName, line.text]),
    ).toEqual([
      [101, 'NOMBRE', ''],
      [202, null, 'ADELANTÓ JUNIO 2022'],
      [401, null, 'PAGÓ EN AGOSTO 2022'],
    ]);
    expect(created.details.lines[1]).toMatchObject({ current: pesos(600), other: pesos(600) });
  });

  it('has one line per depto, no negative payments and bounded texts', () => {
    const twice = [note(101, 'A'), note(101, 'B')];
    expect(() => PaperSheet.create('s', sheetDetails('2022-05', { lines: twice }))).toThrow(
      withCode('SHEET_LINES_DUPLICATED'),
    );
    const negative = [{ ...note(101, ''), other: pesos(-1) }];
    expect(() => PaperSheet.create('s', sheetDetails('2022-05', { lines: negative }))).toThrow(
      withCode('SHEET_FIGURES_INVALID'),
    );
    expect(() =>
      PaperSheet.create('s', sheetDetails('2022-05', { alerts: ['x'.repeat(501)] })),
    ).toThrow(withCode('SHEET_TEXT_TOO_LONG'));
    const longName = [{ ...note(101, ''), ownerName: 'x'.repeat(121) }];
    expect(() => PaperSheet.create('s', sheetDetails('2022-05', { lines: longName }))).toThrow(
      withCode('SHEET_TEXT_TOO_LONG'),
    );
  });

  it('is corrected in place and stays in its month', () => {
    const corrected = sheet('2022-05', 712.25, 3662.25);
    corrected.revise({ ...sheetDetails('2022-06'), source: 'foto 55' });
    expect(String(corrected.month)).toBe('2022-05');
    expect(corrected.details.source).toBe('foto 55');
  });
});

describe('reviewMonth', () => {
  const may = figures('2022-05', 712.25, 600, 150);

  it('puts the month next to its paper: the first sheet opens it, the last one closes it', () => {
    const second = sheet('2022-05', 1000, 1162.25, { fromDay: 11 });
    const first = sheet('2022-05', 712.25, 1000);
    const review = reviewMonth(may, [second, sheet('2022-06', 1162.25, 1300), first]);
    expect(review.sheets).toEqual([first, second]);
    expect(review).toMatchObject({ paperOpening: pesos(712.25), paperClosing: pesos(1162.25) });
    expect(carriedGap(review)).toEqual(pesos(0));
    expect(ownGap(review)).toEqual(pesos(0));
  });

  it('tells its own difference apart from what it inherits', () => {
    // The paper of June opens $100 above what May's rows leave: a row of May is missing.
    const june = reviewMonth(figures('2022-06', 1162.25, 600, 511), [
      sheet('2022-06', 1262.25, 1300),
    ]);
    expect(carriedGap(june)).toEqual(pesos(-100));
    // And its own rows move $51.25 more than its paper did.
    expect(ownGap(june)).toEqual(pesos(51.25));
  });

  it('adds up what the sheets of a month take in and pay out', () => {
    const paper = (income: number | null, expense: number) => ({
      opening: null,
      income: income === null ? null : pesos(income),
      expense: pesos(expense),
      closing: null,
    });
    const first = sheet('2022-05', null, null, { figures: paper(600, 150) });
    const second = sheet('2022-05', null, null, { fromDay: 11, figures: paper(700, 0) });
    expect(reviewMonth(may, [first, second])).toMatchObject({
      paperIncome: pesos(1300),
      paperExpense: pesos(150),
    });
    // Unknown without paper, or when a sheet does not say.
    expect(reviewMonth(may, [])).toMatchObject({ paperIncome: null, paperExpense: null });
    const unread = sheet('2022-05', null, null, { fromDay: 11, figures: paper(null, 0) });
    expect(reviewMonth(may, [first, unread])).toMatchObject({
      paperIncome: null,
      paperExpense: pesos(150),
    });
  });

  it('has nothing to compare where the paper gives no figure', () => {
    const review = reviewMonth(may, [sheet('2022-05', 712.25, null)]);
    expect(carriedGap(review)).toEqual(pesos(0));
    expect(ownGap(review)).toBeNull();
    const unread = reviewMonth(may, [sheet('2022-05', null, null)]);
    expect(carriedGap(unread)).toBeNull();
    expect(reviewMonth(may, [])).toMatchObject({ sheets: [], paperOpening: null });
  });
});

describe('chainMonths', () => {
  it('opens each month with what the one before closed, months without rows included', () => {
    const totals = { '2022-05': [600, 150], '2022-06': [0, 0], '2022-07': [700, 511] } as const;
    const chained = chainMonths(
      [m('2022-05'), m('2022-06'), m('2022-07')],
      pesos(712.25),
      (month) => {
        const [income, expense] = totals[String(month) as keyof typeof totals];
        return { income: pesos(income), expense: pesos(expense) };
      },
    );
    expect(chained.map((month) => month.closing)).toEqual([
      pesos(1162.25),
      pesos(1162.25),
      pesos(1351.25),
    ]);
    expect(chained[2]!.opening).toEqual(pesos(1162.25));
  });
});
