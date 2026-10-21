import { formatMoney } from '@/lib/format';

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
