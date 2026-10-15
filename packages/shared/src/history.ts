import { z } from 'zod';
import { centavosSchema, movementRequestSchema, movementSchema } from './books.js';
import { OWNER_NAME_MAX_LENGTH, unitNumberSchema, yearMonthSchema } from './units.js';

// The building's history: the months before the platform, transcribed from the paper
// sheets (ADR-0022). Only the superadmin sees and edits it while it is in review.

export const SHEET_SOURCE_MAX_LENGTH = 200;
export const SHEET_TEXT_MAX_LENGTH = 500;

const sheetText = z
  .string()
  .max(SHEET_TEXT_MAX_LENGTH, `Usa como máximo ${SHEET_TEXT_MAX_LENGTH} caracteres`);

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
  /** The OBSERVACIONES column: at most one per depto. */
  notes: z
    .array(z.object({ unit: unitNumberSchema, text: sheetText }))
    .max(10)
    .refine(
      (notes) => new Set(notes.map((note) => note.unit)).size === notes.length,
      'Una observación por depto',
    ),
});
export type SheetRequest = z.infer<typeof sheetRequestSchema>;

/** `POST /api/history/sheets`: a sheet found later. */
export const addSheetRequestSchema = sheetRequestSchema.extend({ month: yearMonthSchema });
export type AddSheetRequest = z.infer<typeof addSheetRequestSchema>;

export const HISTORY_FILE_VERSION = 1;

/**
 * The import file (`historial.json`), produced by the transcription script. `POST
 * /api/history/preview` checks it and adds it up; `POST /api/history` brings it in.
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
});
export type HistoryFile = z.infer<typeof historyFileSchema>;

export const historyStatusSchema = z.enum(['IN_REVIEW', 'VERIFIED']);
export type HistoryStatus = z.infer<typeof historyStatusSchema>;

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
  sheets: z.number().int(),
  movements: z.number().int(),
  alerts: z.number().int(),
});
export type HistoryMonthSummary = z.infer<typeof historyMonthSummarySchema>;

export const historySummarySchema = z.object({
  status: historyStatusSchema,
  firstMonth: yearMonthSchema,
  lastMonth: yearMonthSchema,
  openingBalance: centavosSchema,
  /** What the last month closes with. */
  closing: centavosSchema,
  months: z.array(historyMonthSummarySchema),
  /** Where the live books take over; null until they have a start. */
  cutover: z
    .object({
      month: yearMonthSchema,
      openingBalance: centavosSchema,
      /** The captured cash minus the history's closing; null when months lie between. */
      difference: centavosSchema.nullable(),
    })
    .nullable(),
});
export type HistorySummary = z.infer<typeof historySummarySchema>;

/** `GET /api/history`: null until a history is imported. */
export const historyStateSchema = z.object({ history: historySummarySchema.nullable() });

/** `POST /api/history/preview`: what the file would bring in. */
export const historyPreviewSchema = historySummarySchema.extend({
  owners: z.array(z.object({ unit: unitNumberSchema, name: z.string() })),
});
export type HistoryPreview = z.infer<typeof historyPreviewSchema>;

export const historicalSheetSchema = sheetRequestSchema.extend({
  id: z.uuid(),
  month: yearMonthSchema,
});
export type HistoricalSheet = z.infer<typeof historicalSheetSchema>;

/** `GET /api/history/months/:month`. Its rows have no coverage (no accounts in the history). */
export const historicalMonthSchema = monthFiguresSchema.extend({
  /** In review: rows and sheets can be corrected. */
  canEdit: z.boolean(),
  previous: yearMonthSchema.nullable(),
  next: yearMonthSchema.nullable(),
  sheets: z.array(historicalSheetSchema),
  movements: z.array(movementSchema),
});
export type HistoricalMonth = z.infer<typeof historicalMonthSchema>;
