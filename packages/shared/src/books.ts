import { z } from 'zod';
import { localDateSchema, unitNumberSchema, yearMonthSchema } from './units.js';

/** Money travels as integer centavos, never as floats. */
export const centavosSchema = z.number().int();

export const MOVEMENT_CATEGORIES = [
  'UNIT_PAYMENT',
  'OTHER_INCOME',
  'GARBAGE',
  'CLEANING',
  'OTHER_EXPENSE',
] as const;
export const movementCategorySchema = z.enum(MOVEMENT_CATEGORIES);
export type MovementCategory = z.infer<typeof movementCategorySchema>;

/**
 * What each category requires, for the forms. The backend's domain enforces the same table
 * (`CATEGORY_RULES` in the cashbook module) and has the last word.
 */
export const CATEGORY_RULES: Readonly<
  Record<
    MovementCategory,
    { direction: 'IN' | 'OUT'; unit: boolean; description: boolean; week: boolean }
  >
> = {
  UNIT_PAYMENT: { direction: 'IN', unit: true, description: false, week: false },
  OTHER_INCOME: { direction: 'IN', unit: false, description: true, week: false },
  GARBAGE: { direction: 'OUT', unit: false, description: false, week: true },
  CLEANING: { direction: 'OUT', unit: false, description: false, week: false },
  OTHER_EXPENSE: { direction: 'OUT', unit: false, description: true, week: false },
};

/** ISO day of week of a `YYYY-MM-DD` date (1 = Monday … 7 = Sunday), in any time zone. */
export function isoDayOfWeek(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay() || 7;
}

/** Long enough for a payment's observations, which the report prints for its depto. */
export const DESCRIPTION_MAX_LENGTH = 500;

/** `POST /api/movements` and `PUT /api/movements/:id` (the whole row). */
export const movementRequestSchema = z
  .object({
    date: localDateSchema,
    category: movementCategorySchema,
    amount: centavosSchema.positive('El importe debe ser mayor que cero'),
    unit: unitNumberSchema.nullable(),
    description: z
      .string()
      .trim()
      .max(DESCRIPTION_MAX_LENGTH, `Usa como máximo ${DESCRIPTION_MAX_LENGTH} caracteres`)
      .nullable(),
    /** Garbage only: the Monday of the week the row pays for. */
    week: localDateSchema.nullable(),
  })
  .superRefine((row, context) => {
    const rule = CATEGORY_RULES[row.category];
    if (rule.week && row.week === null) {
      context.addIssue({ code: 'custom', path: ['week'], message: 'Elige la semana que se paga' });
    }
    if (!rule.week && row.week !== null) {
      context.addIssue({ code: 'custom', path: ['week'], message: 'Este tipo no lleva semana' });
    }
    if (row.week !== null && isoDayOfWeek(row.week) !== 1) {
      context.addIssue({ code: 'custom', path: ['week'], message: 'La semana empieza en lunes' });
    }
    if (rule.unit && row.unit === null) {
      context.addIssue({ code: 'custom', path: ['unit'], message: 'Elige el depto que pagó' });
    }
    if (!rule.unit && row.unit !== null) {
      context.addIssue({ code: 'custom', path: ['unit'], message: 'Este tipo no lleva depto' });
    }
    if (rule.description && !row.description) {
      context.addIssue({
        code: 'custom',
        path: ['description'],
        message: 'Describe el movimiento',
      });
    }
  });
export type MovementRequest = z.infer<typeof movementRequestSchema>;

export const chargeTypeSchema = z.enum(['MAINTENANCE_FEE', 'SHIFT_SKIP_PENALTY']);
export type ChargeType = z.infer<typeof chargeTypeSchema>;

/** The part of a payment that went to one charge. */
export const paymentCoverageSchema = z.object({
  month: yearMonthSchema,
  type: chargeTypeSchema,
  amount: centavosSchema,
  /** Whether this payment finished paying the charge. */
  settles: z.boolean(),
});
export type PaymentCoverage = z.infer<typeof paymentCoverageSchema>;

export const movementSchema = z.object({
  id: z.uuid(),
  date: localDateSchema,
  category: movementCategorySchema,
  amount: centavosSchema,
  unit: unitNumberSchema.nullable(),
  description: z.string().nullable(),
  /** For a garbage row: the Monday of the week it pays for. */
  week: localDateSchema.nullable(),
  /** For a depto payment: the charges it covered, oldest first. */
  coverage: z.array(paymentCoverageSchema),
});
export type Movement = z.infer<typeof movementSchema>;

export const accountSummarySchema = z.object({
  unit: unitNumberSchema,
  /** Adeudo. */
  outstanding: centavosSchema,
  /** Adelanto: paid ahead, not yet applied. */
  credit: centavosSchema,
});
export type AccountSummary = z.infer<typeof accountSummarySchema>;

/** `POST /api/movements/cleaning-visits`: several visits at once, one row per date. */
export const cleaningVisitsRequestSchema = z.object({
  dates: z
    .array(localDateSchema)
    .min(1, 'Marca al menos un día')
    .max(31)
    .refine((dates) => new Set(dates).size === dates.length, 'Cada día va una sola vez'),
  /** Per visit. */
  amount: centavosSchema.positive('El importe debe ser mayor que cero'),
});
export type CleaningVisitsRequest = z.infer<typeof cleaningVisitsRequestSchema>;

export const garbageWeekStatusSchema = z.enum(['PAID', 'PENDING', 'UPCOMING']);
export type GarbageWeekStatus = z.infer<typeof garbageWeekStatusSchema>;

/** A week of garbage in the month: paid by a row, or a pending suggestion (counts nowhere). */
export const garbageWeekSchema = z.object({
  /** Monday. */
  week: localDateSchema,
  /** Saturday, the suggested payday; it decides which month lists the week. */
  payday: localDateSchema,
  status: garbageWeekStatusSchema,
  /** The row that pays for it, which may be dated in another month. */
  paidBy: z.object({ id: z.uuid(), date: localDateSchema }).nullable(),
  /** The date a one-tap confirmation records. */
  suggestedDate: localDateSchema,
});
export type GarbageWeek = z.infer<typeof garbageWeekSchema>;

/** What to pay the cleaning person for one Monday-to-Sunday week. */
export const cleaningPayoutSchema = z.object({
  weekStart: localDateSchema,
  /** Visits of the week, including those in the neighbouring month when it crosses one. */
  dates: z.array(localDateSchema),
  total: centavosSchema,
});
export type CleaningPayout = z.infer<typeof cleaningPayoutSchema>;

export const monthStatusSchema = z.enum(['NOT_OPENED', 'OPEN', 'CLOSED']);
export type MonthStatus = z.infer<typeof monthStatusSchema>;

/** `GET /api/months/:month`: the month's live report, the turn admin's main screen. */
export const monthlyReportSchema = z.object({
  month: yearMonthSchema,
  status: monthStatusSchema,
  /** False until the superadmin sets where the books start. */
  reportingStarted: z.boolean(),
  /**
   * A month of the building's history, before the cut-over: transcribed from its paper, with
   * no fees, accounts or shift on the platform. Only the superadmin writes it.
   */
  historical: z.boolean(),
  /** Null until the month is opened. */
  balances: z.object({ opening: centavosSchema, closing: centavosSchema }).nullable(),
  totals: z.object({
    income: centavosSchema,
    expense: centavosSchema,
    byCategory: z.record(movementCategorySchema, centavosSchema),
  }),
  /** Live rows by date. */
  movements: z.array(movementSchema),
  canWrite: z.boolean(),
  canOpen: z.boolean(),
  /** The month is over and open, the one before it is closed, and the caller may close it. */
  canClose: z.boolean(),
  /** Closed, and the caller is the superadmin. */
  canReopen: z.boolean(),
  /** Amounts to prefill, from the rates in force that month. */
  suggestions: z
    .object({
      maintenanceFee: centavosSchema,
      cleaningPerVisit: centavosSchema,
      garbageWeekly: centavosSchema,
    })
    .nullable(),
  accounts: z.array(accountSummarySchema),
  /** The month's garbage weeks: the ones whose Saturday falls in it. */
  garbageWeeks: z.array(garbageWeekSchema),
  /** Weekly cleaning payouts for the weeks that touch the month. */
  cleaningPayouts: z.array(cleaningPayoutSchema),
});
export type MonthlyReport = z.infer<typeof monthlyReportSchema>;

export const openMonthResponseSchema = z.object({ opened: z.array(yearMonthSchema) });

/** One opened month in the history: its report in four figures. */
export const monthHistoryEntrySchema = z.object({
  month: yearMonthSchema,
  status: monthStatusSchema.exclude(['NOT_OPENED']),
  openingBalance: centavosSchema,
  income: centavosSchema,
  expense: centavosSchema,
  /** Frozen once closed; live while open. The newest month's is the cash on hand. */
  closingBalance: centavosSchema,
  /** Of the building's history, before the cut-over. */
  historical: z.boolean(),
  canClose: z.boolean(),
  canReopen: z.boolean(),
});
export type MonthHistoryEntry = z.infer<typeof monthHistoryEntrySchema>;

/** `GET /api/months`: every opened month, newest first. */
export const monthHistorySchema = z.object({
  reportingStarted: z.boolean(),
  months: z.array(monthHistoryEntrySchema),
});
export type MonthHistory = z.infer<typeof monthHistorySchema>;

/** Where the books start: the first month and the cash on hand at its beginning. */
export const reportingStartSchema = z.object({
  month: yearMonthSchema,
  openingBalance: centavosSchema.nonnegative('El saldo no puede ser negativo'),
});
export type ReportingStart = z.infer<typeof reportingStartSchema>;

export const reportingStartResponseSchema = z.object({
  start: reportingStartSchema
    .extend({
      /**
       * The first month kept live (fees, accounts, shifts, audit). Later than `month` when
       * the books start with the building's history, whose months come before it.
       */
      cutover: yearMonthSchema,
    })
    .nullable(),
});
export type ReportingStartResponse = z.infer<typeof reportingStartResponseSchema>;

export const chargeStatusSchema = z.enum(['PAID', 'PARTIAL', 'UNPAID']);

export const accountStatementSchema = accountSummarySchema.extend({
  lines: z.array(
    z.object({
      month: yearMonthSchema,
      type: chargeTypeSchema,
      amount: centavosSchema,
      paid: centavosSchema,
      outstanding: centavosSchema,
      status: chargeStatusSchema,
    }),
  ),
});
export type AccountStatement = z.infer<typeof accountStatementSchema>;

export const accountListResponseSchema = z.array(accountSummarySchema);

/** One debt carried into the books: a month (or what was left of it) or a penalty. */
export const openingDebtSchema = z.object({
  month: yearMonthSchema,
  type: chargeTypeSchema,
  amount: centavosSchema.positive('El importe debe ser mayor que cero'),
});
export type OpeningDebt = z.infer<typeof openingDebtSchema>;

/** `PUT /api/opening-balances/:unit`: a depto's whole opening balance (initial load). */
export const openingBalanceRequestSchema = z.object({
  debts: z.array(openingDebtSchema).max(120),
  credit: centavosSchema.nonnegative('El adelanto no puede ser negativo'),
});
export type OpeningBalanceRequest = z.infer<typeof openingBalanceRequestSchema>;

export const openingBalanceSchema = openingBalanceRequestSchema.extend({
  unit: unitNumberSchema,
});
export type OpeningBalance = z.infer<typeof openingBalanceSchema>;

/** `GET /api/opening-balances`: what every depto carried into the books. */
export const openingBalancesSchema = z.object({
  /** The first month of the books; every debt is from before it. */
  start: yearMonthSchema,
  /** Fixed once the first month is closed. */
  locked: z.boolean(),
  balances: z.array(openingBalanceSchema),
});
export type OpeningBalances = z.infer<typeof openingBalancesSchema>;
