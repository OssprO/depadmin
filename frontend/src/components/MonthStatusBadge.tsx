import { LockIcon } from '@phosphor-icons/react';
import { Badge } from '@/components/ui/badge';

/** `TO_CLOSE`: over, still open, and the viewer can close it now. */
export type MonthBadgeStatus = 'NOT_OPENED' | 'OPEN' | 'CLOSED' | 'TO_CLOSE';

const LABELS: Record<MonthBadgeStatus, string> = {
  NOT_OPENED: 'Sin abrir',
  OPEN: 'Abierto',
  CLOSED: 'Cerrado',
  TO_CLOSE: 'Por cerrar',
};

/**
 * A month's state, the same on every screen. Closed carries a lock and open a filled dot in
 * the income green, so the two differ by shape as well as by color (WCAG 1.4.1).
 */
export function MonthStatusBadge({ status }: { status: MonthBadgeStatus }) {
  switch (status) {
    case 'CLOSED':
      return (
        <Badge variant="secondary">
          <LockIcon weight="bold" aria-hidden data-icon="inline-start" />
          {LABELS.CLOSED}
        </Badge>
      );
    case 'OPEN':
      return (
        <Badge variant="outline">
          <span aria-hidden className="size-2 rounded-full bg-income" />
          {LABELS.OPEN}
        </Badge>
      );
    case 'TO_CLOSE':
      return <Badge>{LABELS.TO_CLOSE}</Badge>;
    case 'NOT_OPENED':
      return <Badge variant="outline">{LABELS.NOT_OPENED}</Badge>;
  }
}
