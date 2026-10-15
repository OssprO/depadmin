import {
  ConflictError,
  type Money,
  type UnitNumber,
  ValidationError,
  type YearMonth,
} from '../../../shared-kernel/index.js';

export const SHEET_SOURCE_MAX_LENGTH = 200;
export const SHEET_TEXT_MAX_LENGTH = 500;

/** What the paper says. Null where the sheet is missing or the figure cannot be read. */
export interface PaperFigures {
  readonly opening: Money | null;
  readonly income: Money | null;
  readonly expense: Money | null;
  readonly closing: Money | null;
}

/** A depto's line in the OBSERVACIONES column («ADEUDA JULIO», «PAGÓ EN JUNIO»…). */
export interface UnitNote {
  readonly unit: UnitNumber;
  readonly text: string;
}

export interface SheetDetails {
  readonly month: YearMonth;
  /** The day the sheet starts on: 1, or later when the administration changed mid-month. */
  readonly fromDay: number;
  /** Where it was transcribed from: a PDF page or a photo. */
  readonly source: string;
  readonly figures: PaperFigures;
  /** Transcription remarks: what does not add up, what is missing. */
  readonly alerts: readonly string[];
  readonly notes: readonly UnitNote[];
}

/**
 * One paper sheet of the history: a month, or the part of one that an administrator handed
 * over mid-month. The rows are not part of it (they belong to the month); it keeps what is
 * needed to check them: the paper's own figures, its remarks and its observations per depto.
 */
export class PaperSheet {
  private constructor(
    readonly id: string,
    private current: SheetDetails,
  ) {}

  static create(id: string, details: SheetDetails): PaperSheet {
    return new PaperSheet(id, validate(details));
  }

  get details(): SheetDetails {
    return this.current;
  }

  get month(): YearMonth {
    return this.current.month;
  }

  /** Corrects what was transcribed; a sheet never moves to another month. */
  revise(details: Omit<SheetDetails, 'month'>): void {
    this.current = validate({ ...details, month: this.current.month });
  }
}

/** A month has one sheet per starting day. */
export function assertNewSheetDay(sheet: PaperSheet, others: readonly PaperSheet[]): void {
  const clash = others.find(
    (other) =>
      other.id !== sheet.id &&
      other.month.equals(sheet.month) &&
      other.details.fromDay === sheet.details.fromDay,
  );
  if (clash) {
    throw new ConflictError(
      'SHEET_DUPLICATED',
      `${sheet.month} already has a sheet starting on day ${sheet.details.fromDay}`,
    );
  }
}

function validate(details: SheetDetails): SheetDetails {
  const { month, fromDay, figures } = details;
  if (!Number.isInteger(fromDay) || fromDay < 1 || fromDay > month.daysInMonth) {
    throw new ValidationError('SHEET_DAY_INVALID', `${month} has no day ${fromDay}`);
  }
  const source = details.source.trim();
  if (!source || source.length > SHEET_SOURCE_MAX_LENGTH) {
    throw new ValidationError('SHEET_SOURCE_INVALID', `Invalid sheet source "${source}"`);
  }
  for (const total of [figures.income, figures.expense]) {
    if (total?.isNegative()) {
      throw new ValidationError('SHEET_FIGURES_INVALID', `A total cannot be negative: ${total}`);
    }
  }
  const alerts = details.alerts.map((alert) => text(alert)).filter((alert) => alert !== '');
  const notes = details.notes
    .map((note) => ({ unit: note.unit, text: text(note.text) }))
    .filter((note) => note.text !== '')
    .sort((a, b) => a.unit.value - b.unit.value);
  notes.forEach((note, i) => {
    if (i > 0 && notes[i - 1]!.unit === note.unit) {
      throw new ValidationError(
        'SHEET_NOTES_DUPLICATED',
        `Depto ${note.unit} has two observations on one sheet`,
      );
    }
  });
  return { month, fromDay, source, figures, alerts, notes };
}

function text(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length > SHEET_TEXT_MAX_LENGTH) {
    throw new ValidationError(
      'SHEET_TEXT_TOO_LONG',
      `Use at most ${SHEET_TEXT_MAX_LENGTH} characters: "${trimmed.slice(0, 40)}…"`,
    );
  }
  return trimmed;
}
