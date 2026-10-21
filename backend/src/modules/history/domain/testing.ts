import { Money, type PaperLine, UnitNumber, YearMonth } from '../../../shared-kernel/index.js';
import { type MonthFigures } from './history-review.js';
import { type PaperFigures, PaperSheet, type SheetDetails } from './paper-sheet.js';

// Test builders shared by the history specs.

export const m = (text: string) => YearMonth.parse(text);
export const pesos = (amount: number) => Money.ofPesos(amount);

let next = 0;
const id = () => `00000000-0000-4000-8000-${String(++next).padStart(12, '0')}`;

const noFigures: PaperFigures = { opening: null, income: null, expense: null, closing: null };

/** A depto's line with only its OBSERVACIONES. */
export const note = (unit: number, text: string): PaperLine => ({
  unit: UnitNumber.of(unit),
  ownerName: null,
  current: null,
  other: null,
  text,
});

export const sheetDetails = (
  month: string,
  overrides: Partial<Omit<SheetDetails, 'month'>> = {},
): SheetDetails => ({
  month: m(month),
  fromDay: 1,
  source: 'PDF p1',
  responsible: null,
  figures: noFigures,
  alerts: [],
  lines: [],
  ...overrides,
});

/** A sheet whose paper opens and closes with these amounts (in pesos). */
export const sheet = (
  month: string,
  opening: number | null,
  closing: number | null,
  overrides: Partial<Omit<SheetDetails, 'month'>> = {},
) =>
  PaperSheet.create(
    id(),
    sheetDetails(month, {
      figures: {
        opening: opening === null ? null : pesos(opening),
        income: null,
        expense: null,
        closing: closing === null ? null : pesos(closing),
      },
      ...overrides,
    }),
  );

/** A month as the books add it up, in pesos. */
export const figures = (
  month: string,
  opening: number,
  income: number,
  expense: number,
): MonthFigures => ({
  month: m(month),
  opening: pesos(opening),
  income: pesos(income),
  expense: pesos(expense),
  closing: pesos(opening + income - expense),
});
