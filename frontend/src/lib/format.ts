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
