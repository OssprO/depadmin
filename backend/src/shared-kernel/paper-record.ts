import type { Money } from './money.js';
import type { UnitNumber } from './unit-number.js';
import type { YearMonth } from './year-month.js';

/**
 * A depto's line on a paper sheet, as written: who owned it then, what it paid towards the
 * month (MES EN CURSO) and towards debts or ahead (ADEUDOS/ADELANTOS), and its OBSERVACIONES.
 * A null amount means the paper does not split it (the report then splits it by the fee).
 */
export interface PaperLine {
  readonly unit: UnitNumber;
  readonly ownerName: string | null;
  readonly current: Money | null;
  readonly other: Money | null;
  readonly text: string;
}

/** A paper sheet of a month of the history: from its first day, or from a mid-month handover. */
export interface PaperPage {
  readonly fromDay: number;
  readonly lines: readonly PaperLine[];
}

/**
 * Port: the paper sheets of a month before the cut-over, so its report reads like the sheet
 * that circulated. The history module answers it; the reports module asks without importing
 * it, since the history reads the reports (cycle-free, like `MonthLedger`).
 */
export interface PaperRecord {
  /** The month's sheets by starting day; none when its paper is missing. */
  pagesOf(month: YearMonth): Promise<PaperPage[]>;
}

export const PAPER_RECORD = Symbol('PaperRecord');
