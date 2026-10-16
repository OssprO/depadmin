import {
  type Instant,
  type LocalDate,
  Money,
  type YearMonth,
} from '../../../../shared-kernel/index.js';
import type { PaymentCoverage } from '../../../billing/application/index.js';
import type { OwedCharge, UnitReportLine } from '../../application/index.js';

// The report's text, in the building's own style (the "Balance Correspondencia 63" sheets):
// uppercase observations such as "LIQUIDA FEBRERO Y MARZO | PAGA ABRIL" or "ADEUDA DE
// FEBRERO A ABRIL (3 MESES) TOTAL 2,100". Only characters in the standard PDF fonts
// (WinAnsi) are used: "-" instead of the minus sign, which Helvetica cannot draw.

const TIME_ZONE = 'America/Mexico_City';
const MONTHS = [
  'ENERO',
  'FEBRERO',
  'MARZO',
  'ABRIL',
  'MAYO',
  'JUNIO',
  'JULIO',
  'AGOSTO',
  'SEPTIEMBRE',
  'OCTUBRE',
  'NOVIEMBRE',
  'DICIEMBRE',
];

const currency = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  currencyDisplay: 'narrowSymbol',
});
const plain = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 });

/** 140000 centavos → "$1,400.00". */
export const money = (amount: Money): string => currency.format(amount.centavos / 100);

/** As the observations write amounts: "2,100", "600.50". */
export const amount = (value: Money): string => plain.format(value.centavos / 100);

export const monthName = (month: YearMonth): string => MONTHS[month.month - 1] ?? '';

/** "ABRIL 2026". */
export const monthTitle = (month: YearMonth): string => `${monthName(month)} ${month.year}`;

/** "SEP '25". */
const shortMonth = (month: YearMonth) =>
  `${monthName(month).slice(0, 3)} '${String(month.year).slice(2)}`;

/** "07-abr", as the "otros" rows date things. */
export const dayMonth = (date: LocalDate): string =>
  `${String(date.day).padStart(2, '0')}-${monthName(date.yearMonth).slice(0, 3).toLowerCase()}`;

/** "SEMANA DEL 30 AL 5" for the week starting on Monday 30 March. */
export const weekLabel = (monday: LocalDate): string =>
  `SEMANA DEL ${monday.day} AL ${monday.plusDays(6).day}`;

/** A week's cleaning visits by day: "06, 08 Y 10". */
export const visitDays = (dates: readonly LocalDate[]): string =>
  joined(dates.map((date) => String(date.day).padStart(2, '0')));

/** "14 oct 2026, 10:58" in the building's time zone. */
export function timestamp(instant: Instant): string {
  const parts = new Intl.DateTimeFormat('es-MX', {
    timeZone: TIME_ZONE,
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(instant.epochMillis));
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const month = MONTHS[Number(part('month')) - 1]?.slice(0, 3).toLowerCase() ?? '';
  return `${part('day')} ${month} ${part('year')}, ${part('hour')}:${part('minute')}`;
}

/** "A", "A Y B", "A, B Y C". */
function joined(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} Y ${items.at(-1)}`;
}

/** Whether the months follow one another with no gap. */
function contiguous(months: readonly YearMonth[]): boolean {
  return months.every((month, i) => i === 0 || month.equals((months[i - 1] as YearMonth).next()));
}

/** Months as people write them: "JUNIO", "JUNIO Y JULIO", "DE FEBRERO A JUNIO". */
function monthList(months: readonly YearMonth[]): string {
  if (months.length >= 3 && contiguous(months)) {
    return `DE ${monthName(months[0] as YearMonth)} A ${monthName(months.at(-1) as YearMonth)}`;
  }
  return joined(months.map(monthName));
}

/**
 * Groups whole months that follow one another: [ago, sep, oct, dic] → [[ago, sep, oct], [dic]].
 * A partly paid month always stands on its own.
 */
function runs(fees: readonly OwedCharge[]): OwedCharge[][] {
  const result: OwedCharge[][] = [];
  for (const fee of fees) {
    const last = result.at(-1);
    const previous = last?.at(-1);
    const follows = previous?.whole && fee.whole && fee.month.equals(previous.month.next());
    if (last && follows) last.push(fee);
    else result.push([fee]);
  }
  return result;
}

const sum = (items: readonly { amount: Money }[]) => Money.sum(items.map((item) => item.amount));

/**
 * What a depto still owed at the end of the month. Whole months in a row read simply
 * ("ADEUDA ABRIL Y MAYO", "ADEUDA DE FEBRERO A ABRIL (3 MESES) TOTAL 2,100"); anything else
 * is itemized ("ADEUDA 10,000 | 600 DE AGO '25 + 8,400 DE SEP '25 A AGO '26 + 1,000 POR NO
 * LLEVAR ADMINISTRACIÓN").
 */
export function owedText(owed: readonly OwedCharge[]): string | null {
  if (owed.length === 0) return null;
  const fees = owed.filter((charge) => charge.type === 'MAINTENANCE_FEE');
  const penalties = owed.filter((charge) => charge.type === 'SHIFT_SKIP_PENALTY');
  const total = sum(owed);
  const months = fees.map((fee) => fee.month);

  if (penalties.length === 0 && fees.every((fee) => fee.whole) && contiguous(months)) {
    if (fees.length >= 3) {
      return `ADEUDA ${monthList(months)} (${fees.length} MESES) TOTAL ${amount(total)}`;
    }
    return `ADEUDA ${monthList(months)}`;
  }

  const parts: string[] = [];
  for (const group of runs(fees)) {
    const first = group[0] as OwedCharge;
    const last = group.at(-1) as OwedCharge;
    const span =
      group.length === 1
        ? shortMonth(first.month)
        : `${shortMonth(first.month)} A ${shortMonth(last.month)}`;
    parts.push(`${amount(sum(group))} DE ${span}`);
  }
  if (penalties.length > 0) parts.push(`${amount(sum(penalties))} POR NO LLEVAR ADMINISTRACIÓN`);
  return `ADEUDA ${amount(total)} | ${parts.join(' + ')}`;
}

/** What the month's payments did, beyond the month's own fee. */
function paymentTexts(line: UnitReportLine, month: YearMonth, fee: Money | null): string[] {
  const texts: string[] = [];
  // One entry per charge, as it ended: a charge paid in two payments shows once.
  const byCharge = new Map<string, PaymentCoverage>();
  for (const part of line.covered) byCharge.set(`${String(part.month)}:${part.type}`, part);
  const parts = [...byCharge.values()];
  const earlier = parts.filter((p) => p.month.isBefore(month));

  const settled = earlier.filter((p) => p.settles && p.type === 'MAINTENANCE_FEE');
  const partial = earlier.filter((p) => !p.settles && p.type === 'MAINTENANCE_FEE');
  const penalties = earlier.filter((p) => p.type === 'SHIFT_SKIP_PENALTY');
  if (settled.length > 0) texts.push(`LIQUIDA ${monthList(settled.map((p) => p.month))}`);
  if (partial.length > 0) texts.push(`ABONA A ${monthList(partial.map((p) => p.month))}`);
  if (penalties.length > 0) {
    texts.push(`PAGA ${amount(sum(penalties))} POR NO LLEVAR ADMINISTRACIÓN`);
  }

  const current = line.currentFee;
  if (current?.paidThisMonth.isPositive() && (texts.length > 0 || line.advanced.isPositive())) {
    texts.push(`${current.outstanding.isZero() ? 'PAGA' : 'ABONA A'} ${monthName(month)}`);
  }

  if (line.advanced.isPositive()) {
    const older = line.credit.minus(line.advanced);
    const months = fee && fee.isPositive() ? line.advanced.centavos / fee.centavos : 0;
    if (Number.isInteger(months) && months > 0) {
      const skip = fee && older.isPositive() ? Math.floor(older.centavos / fee.centavos) : 0;
      const ahead = Array.from({ length: months }, (_, i) => month.plus(1 + skip + i));
      texts.push(`ADELANTA ${monthList(ahead)}`);
    } else {
      texts.push(`ADELANTA ${amount(line.advanced)}`);
    }
  }
  return texts;
}

/**
 * The OBSERVACIONES cell: what the month's payments covered, a fee already paid in advance,
 * an adelanto, and what is still owed, joined with " | ".
 */
export function observations(line: UnitReportLine, month: YearMonth, fee: Money | null): string {
  if (!line.active) return 'INACTIVO';
  const texts = paymentTexts(line, month, fee);
  const current = line.currentFee;
  if (current && current.paidThisMonth.isZero() && current.paidBefore.isPositive()) {
    const when = current.paidBeforeIn;
    if (current.outstanding.isZero() && when) {
      texts.push(`PAGÓ EN ${when.year === month.year ? monthName(when) : monthTitle(when)}`);
    }
  }
  if (line.advanced.isZero() && line.credit.isPositive()) {
    texts.push(`SALDO A FAVOR ${amount(line.credit)}`);
  }
  const owed = owedText(line.owed);
  if (owed) texts.push(owed);
  return texts.join(' | ');
}

/**
 * A depto's OBSERVACIONES cell (ADR-0024): what the administrator wrote on its payments,
 * joined when it paid more than once; without any, what its paper sheet says (a month of the
 * history) or what its account suggests (a live month).
 */
export function observationsCell(
  line: UnitReportLine,
  month: YearMonth,
  fee: Money | null,
): string {
  if (line.notes.length > 0) return line.notes.join(' | ');
  if (line.paper) return line.paper.text;
  return observations(line, month, fee);
}

/** How the "MES EN CURSO" cell reads: owed (red), paid in advance (green), or plain. */
export function currentFeeTone(line: UnitReportLine): 'owed' | 'paidBefore' | 'plain' {
  const current = line.currentFee;
  if (!current) return 'plain';
  if (current.outstanding.isPositive()) return 'owed';
  if (current.paidThisMonth.isZero() && current.paidBefore.isPositive()) return 'paidBefore';
  return 'plain';
}
