import {
  LocalDate,
  Money,
  type MovementDetails,
  UnitNumber,
  YearMonth,
} from '../../../shared-kernel/index.js';
import { HistoricalMovement } from './historical-movement.js';
import { type PaperFigures, PaperSheet, type SheetDetails } from './paper-sheet.js';

// Test builders shared by the history specs.

export const m = (text: string) => YearMonth.parse(text);
export const d = (text: string) => LocalDate.parse(text);
export const pesos = (amount: number) => Money.ofPesos(amount);

let next = 0;
const id = () => `00000000-0000-4000-8000-${String(++next).padStart(12, '0')}`;

export const paid = (date: string, unit: number, amount = 700): MovementDetails => ({
  date: d(date),
  category: 'UNIT_PAYMENT',
  amount: pesos(amount),
  description: null,
  unit: UnitNumber.of(unit),
  week: null,
});

export const spent = (date: string, amount: number, description = 'LUZ'): MovementDetails => ({
  date: d(date),
  category: 'OTHER_EXPENSE',
  amount: pesos(amount),
  description,
  unit: null,
  week: null,
});

/** Garbage paid on `date` for the week of that date. */
export const garbage = (date: string, amount = 150): MovementDetails => ({
  date: d(date),
  category: 'GARBAGE',
  amount: pesos(amount),
  description: null,
  unit: null,
  week: d(date).startOfWeek(),
});

export const row = (details: MovementDetails) => HistoricalMovement.record(id(), details);

const noFigures: PaperFigures = { opening: null, income: null, expense: null, closing: null };

export const sheetDetails = (
  month: string,
  overrides: Partial<Omit<SheetDetails, 'month'>> = {},
): SheetDetails => ({
  month: m(month),
  fromDay: 1,
  source: 'PDF p1',
  figures: noFigures,
  alerts: [],
  notes: [],
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
