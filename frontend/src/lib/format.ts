/** Compact Spanish duration, e.g. 45 → "45 s", 3720 → "1 h 2 min", 90000 → "1 d 1 h". */
export function formatDuration(totalSeconds: number): string {
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return hours > 0 ? `${days} d ${hours} h` : `${days} d`;
  if (hours > 0) return minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`;
  if (minutes > 0) return `${minutes} min`;
  return `${seconds} s`;
}

/** The building is in Mexico City; times are shown in its clock wherever the phone is. */
export const BUILDING_TIME_ZONE = 'America/Mexico_City';

const dayKeyFormat = new Intl.DateTimeFormat('en-CA', { timeZone: BUILDING_TIME_ZONE });
const dayFormat = new Intl.DateTimeFormat('es-MX', {
  timeZone: BUILDING_TIME_ZONE,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const timeFormat = new Intl.DateTimeFormat('es-MX', {
  timeZone: BUILDING_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** The building's calendar day of an instant, as YYYY-MM-DD (for grouping). */
export function dayKey(iso: string): string {
  return dayKeyFormat.format(new Date(iso));
}

/** e.g. "lunes, 13 de octubre de 2026". */
export function formatDay(iso: string): string {
  return dayFormat.format(new Date(iso));
}

/** e.g. "12:30". */
export function formatTime(iso: string): string {
  return timeFormat.format(new Date(iso));
}

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

function parseMonth(month: string): { year: number; name: string } {
  const [year = '', number = ''] = month.split('-');
  return { year: Number(year), name: MONTHS[Number(number) - 1] ?? month };
}

/** "2026-10" → "octubre 2026". */
export function formatMonth(month: string): string {
  const { year, name } = parseMonth(month);
  return `${name} ${year}`;
}

/** "2026-10" → "oct". */
export function formatMonthShort(month: string): string {
  return parseMonth(month).name.slice(0, 3);
}

/** "2026-10".."2026-11" → "oct–nov 2026"; across years, "dic 2026 – ene 2027". */
export function formatMonthRange(from: string, to: string): string {
  const start = parseMonth(from);
  const end = parseMonth(to);
  if (from === to) return `${start.name.slice(0, 3)} ${start.year}`;
  if (start.year === end.year) {
    return `${start.name.slice(0, 3)}–${end.name.slice(0, 3)} ${end.year}`;
  }
  return `${start.name.slice(0, 3)} ${start.year} – ${end.name.slice(0, 3)} ${end.year}`;
}

/** "YYYY-MM" plus `months` (negative to go back). */
export function addMonths(month: string, months: number): string {
  const [year = 0, number = 1] = month.split('-').map(Number);
  const index = year * 12 + (number - 1) + months;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

const pesos = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

/** Centavos as pesos, e.g. 50000 → "$500.00". */
export function formatMoney(centavos: number): string {
  return pesos.format(centavos / 100);
}
