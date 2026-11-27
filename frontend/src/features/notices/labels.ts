import type { Notice } from '@depadmin/shared';
import { dayKey, formatFullDate } from '@/lib/format';

/** «Depto 401» or «Superadmin». */
export function authorLabel(author: Notice['author']): string {
  return author.role === 'OWNER' ? `Depto ${author.unit}` : 'Superadmin';
}

/** «Depto 401 · 27 de noviembre de 2026». */
export function publishedLine(notice: Notice): string {
  return `${authorLabel(notice.author)} · ${formatFullDate(dayKey(notice.publishedAt))}`;
}

/** «1 aviso sin leer», «2 avisos sin leer». */
export function unreadText(count: number): string {
  return count === 1 ? '1 aviso sin leer' : `${count} avisos sin leer`;
}
