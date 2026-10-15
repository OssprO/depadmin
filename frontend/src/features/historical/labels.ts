import { addDays, dayOfWeek, formatMoney } from '@/lib/format';

/** How a month's rows compare with its paper, in a few words. */
export function gapLabel(gap: number | null, sheets: number): string {
  if (sheets === 0) return 'Sin hoja';
  if (gap === null) return 'Sin cifras';
  if (gap === 0) return 'Cuadra';
  return `${gap > 0 ? 'Sobran' : 'Faltan'} ${formatMoney(Math.abs(gap))}`;
}

export type GapTone = 'ok' | 'off' | 'unknown';

export function gapTone(gap: number | null, sheets: number): GapTone {
  if (sheets === 0 || gap === null) return 'unknown';
  return gap === 0 ? 'ok' : 'off';
}

/**
 * The Mondays a garbage row of the month can pay: from the week that ends as the month
 * begins (paper sheets list it there) to the last one that starts in it.
 */
export function weeksAround(month: string): string[] {
  const first = `${month}-01`;
  let monday = addDays(first, -(dayOfWeek(first) - 1) - 7);
  const weeks: string[] = [];
  for (; monday.slice(0, 7) <= month; monday = addDays(monday, 7)) weeks.push(monday);
  return weeks;
}
