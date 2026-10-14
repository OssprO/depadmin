import type { Instant, LocalDate, Money, YearMonth } from '../../../../shared-kernel/index.js';
import type { PaymentCoverage } from '../../../billing/application/index.js';
import type { OwedCharge } from '../../application/index.js';

// Spanish text for the PDF. Only characters in the standard PDF fonts (WinAnsi) are used:
// "-" instead of the minus sign, which Helvetica cannot draw.

const TIME_ZONE = 'America/Mexico_City';
const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];
const DAYS = ['', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];

const currency = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  currencyDisplay: 'narrowSymbol',
});

/** 140000 centavos → "$1,400.00". */
export const money = (amount: Money): string => currency.format(amount.centavos / 100);

/** "Septiembre 2026". */
export function monthTitle(month: YearMonth): string {
  const name = MONTHS[month.month - 1] ?? '';
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${month.year}`;
}

/** "sep". */
export const monthShort = (month: YearMonth): string => (MONTHS[month.month - 1] ?? '').slice(0, 3);

/** "sáb 5 sep". */
export const shortDate = (date: LocalDate): string =>
  `${DAYS[date.dayOfWeek]} ${date.day} ${monthShort(date.yearMonth)}`;

/** A Monday-to-Sunday week by its Monday: "5-11 oct", or "28 sep - 4 oct" across months. */
export function week(monday: LocalDate): string {
  const sunday = monday.plusDays(6);
  return monday.yearMonth.equals(sunday.yearMonth)
    ? `${monday.day}-${sunday.day} ${monthShort(sunday.yearMonth)}`
    : `${monday.day} ${monthShort(monday.yearMonth)} - ${sunday.day} ${monthShort(sunday.yearMonth)}`;
}

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
  const month = MONTHS[Number(part('month')) - 1]?.slice(0, 3) ?? '';
  return `${part('day')} ${month} ${part('year')}, ${part('hour')}:${part('minute')}`;
}

/** Months joined as people write them: "ago", "ago y sep", "ago, sep y oct". */
function joined(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} y ${items.at(-1)}`;
}

const chargeLabel = (month: YearMonth, type: OwedCharge['type']) =>
  type === 'SHIFT_SKIP_PENALTY' ? `multa ${monthShort(month)}` : monthShort(month);

/** What a depto's payments covered: "cubre ago y sep", "abono a oct", "cubre sep; abono a oct". */
export function coverage(covered: readonly PaymentCoverage[]): string {
  // A charge paid in two payments the same month shows once, as settled if it ended paid.
  const byCharge = new Map<string, PaymentCoverage>();
  for (const part of covered) byCharge.set(`${String(part.month)}:${part.type}`, part);
  const parts = [...byCharge.values()];
  const settled = parts.filter((p) => p.settles).map((p) => chargeLabel(p.month, p.type));
  const partial = parts.filter((p) => !p.settles).map((p) => chargeLabel(p.month, p.type));
  return [
    settled.length > 0 && `cubre ${joined(settled)}`,
    partial.length > 0 && `abono a ${joined(partial)}`,
  ]
    .filter(Boolean)
    .join('; ');
}

/** What a depto still owed: "ago, sep y multa sep". */
export const owed = (charges: readonly OwedCharge[]): string =>
  joined(charges.map((charge) => chargeLabel(charge.month, charge.type)));
