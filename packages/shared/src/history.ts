import { z } from 'zod';
import { centavosSchema, monthStatusSchema, movementRequestSchema } from './books.js';
import {
  localDateSchema,
  OWNER_NAME_MAX_LENGTH,
  unitNumberSchema,
  yearMonthSchema,
} from './units.js';

// The building's history (ADR-0023): the months from the start of the books to the cut-over,
// transcribed from the paper sheets. They are ordinary months of the books; what is kept
// apart is each sheet, to check the month against it and to print its report like it.

export const SHEET_SOURCE_MAX_LENGTH = 200;
export const SHEET_TEXT_MAX_LENGTH = 500;

const sheetText = z
  .string()
  .max(SHEET_TEXT_MAX_LENGTH, `Usa como máximo ${SHEET_TEXT_MAX_LENGTH} caracteres`);

const paidAmount = centavosSchema.nonnegative('No puede ser negativo').nullable();

/**
 * A depto's line on the sheet, as written: the owner it names, what it paid towards the
 * month (MES EN CURSO) and towards debts or ahead (ADEUDOS/ADELANTOS), and its OBSERVACIONES.
 * Null where the paper leaves it blank or does not split it.
 */
export const paperLineSchema = z.object({
  unit: unitNumberSchema,
  ownerName: z.string().trim().max(OWNER_NAME_MAX_LENGTH).nullable(),
  current: paidAmount,
  other: paidAmount,
  text: sheetText,
});
export type PaperLine = z.infer<typeof paperLineSchema>;

/** A paper sheet as it is sent: what the paper says. Null where it is missing or unreadable. */
export const sheetRequestSchema = z.object({
  /** The day it starts on: 1, or later when the administration changed mid-month. */
  fromDay: z.number().int().min(1, 'Día inválido').max(31, 'Día inválido'),
  /** Where it was transcribed from: a PDF page or a photo. */
  source: z
    .string()
    .trim()
    .min(1, 'Di de dónde sale la hoja')
    .max(SHEET_SOURCE_MAX_LENGTH, `Usa como máximo ${SHEET_SOURCE_MAX_LENGTH} caracteres`),
  opening: centavosSchema.nullable(),
  income: centavosSchema.nonnegative('No puede ser negativo').nullable(),
  expense: centavosSchema.nonnegative('No puede ser negativo').nullable(),
  closing: centavosSchema.nullable(),
  /** Transcription remarks. */
  alerts: z.array(sheetText).max(50),
  /** One line per depto at most. */
  lines: z
    .array(paperLineSchema)
    .max(10)
    .refine(
      (lines) => new Set(lines.map((line) => line.unit)).size === lines.length,
      'Un renglón por depto',
    ),
});
export type SheetRequest = z.infer<typeof sheetRequestSchema>;

/** `POST /api/history/sheets`: a sheet found later. */
export const addSheetRequestSchema = sheetRequestSchema.extend({ month: yearMonthSchema });
export type AddSheetRequest = z.infer<typeof addSheetRequestSchema>;

export const rateNameSchema = z.enum([
  'maintenanceFee',
  'cleaningPerVisit',
  'garbageWeekly',
  'shiftSkipPenalty',
]);
export type RateNameValue = z.infer<typeof rateNameSchema>;

export const HISTORY_FILE_VERSION = 2;

/**
 * The import file (`historial.json`), produced by the transcription script. `POST
 * /api/history/preview` checks it and adds it up; `POST /api/history` starts the books with
 * it. A month without paper may be left out: it comes in empty.
 */
export const historyFileSchema = z.object({
  version: z.literal(HISTORY_FILE_VERSION, { error: 'Versión de archivo desconocida' }),
  /** Cash on hand when the first month began. */
  openingBalance: centavosSchema,
  months: z
    .array(
      z.object({
        month: yearMonthSchema,
        sheets: z.array(sheetRequestSchema).max(5),
        movements: z.array(movementRequestSchema).max(500),
      }),
    )
    .min(1, 'El archivo no trae meses')
    .max(240),
  /** Owners' names as the current administration roster lists them. */
  owners: z
    .array(
      z.object({
        unit: unitNumberSchema,
        name: z.string().trim().min(1).max(OWNER_NAME_MAX_LENGTH),
      }),
    )
    .max(10),
  /** The rates in force in the history, to prefill its forms (it charges no fees). */
  rates: z
    .array(
      z.object({
        rate: rateNameSchema,
        effectiveFrom: localDateSchema,
        amount: centavosSchema.positive(),
      }),
    )
    .max(40),
});
export type HistoryFile = z.infer<typeof historyFileSchema>;

/** A month's figures: its rows added up, and how they compare with its paper. */
const monthFiguresSchema = z.object({
  month: yearMonthSchema,
  /** Carried from the month before. */
  opening: centavosSchema,
  income: centavosSchema,
  expense: centavosSchema,
  closing: centavosSchema,
  /** What its first sheet opens with and its last one closes with. */
  paperOpening: centavosSchema.nullable(),
  paperClosing: centavosSchema.nullable(),
  /** What its sheets add up to; null without sheets or when one of them does not say. */
  paperIncome: centavosSchema.nullable(),
  paperExpense: centavosSchema.nullable(),
  /** Its rows' net minus what its paper moved; zero when they agree. */
  ownGap: centavosSchema.nullable(),
  /** The balance carried into it minus its paper's opening: what earlier months leave. */
  carriedGap: centavosSchema.nullable(),
});

export const historyMonthSummarySchema = monthFiguresSchema.extend({
  /** Closing a month of the history is checking it against its paper. */
  status: monthStatusSchema.exclude(['NOT_OPENED']),
  sheets: z.number().int(),
  alerts: z.number().int(),
});
export type HistoryMonthSummary = z.infer<typeof historyMonthSummarySchema>;

export const historySummarySchema = z.object({
  firstMonth: yearMonthSchema,
  lastMonth: yearMonthSchema,
  /** The first month kept live: it opens with what the history closes with. */
  cutover: yearMonthSchema,
  openingBalance: centavosSchema,
  /** What the last month closes with. */
  closing: centavosSchema,
  months: z.array(historyMonthSummarySchema),
});
export type HistorySummary = z.infer<typeof historySummarySchema>;

/** `GET /api/history`: null while the books do not start with a history. */
export const historyStateSchema = z.object({ history: historySummarySchema.nullable() });

/** `POST /api/history/preview`: what the file would bring in. */
export const historyPreviewSchema = historySummarySchema.extend({
  owners: z.array(z.object({ unit: unitNumberSchema, name: z.string() })),
  movements: z.number().int(),
});
export type HistoryPreview = z.infer<typeof historyPreviewSchema>;

export const paperSheetSchema = sheetRequestSchema.extend({
  id: z.uuid(),
  month: yearMonthSchema,
});
export type PaperSheet = z.infer<typeof paperSheetSchema>;

/** `GET /api/history/months/:month`: the month next to its paper, with its sheets. */
export const paperMonthSchema = monthFiguresSchema.extend({
  /** The month is open and the caller is the superadmin: its sheets can be corrected. */
  canEdit: z.boolean(),
  sheets: z.array(paperSheetSchema),
});
export type PaperMonth = z.infer<typeof paperMonthSchema>;
