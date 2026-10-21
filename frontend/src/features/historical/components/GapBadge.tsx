import { Badge } from '@/components/ui/badge';
import { gapLabel, gapTone } from '../labels';

const VARIANT = { ok: 'secondary', off: 'destructive', unknown: 'outline' } as const;

/** Whether a month's own rows explain what its paper moved. */
export function GapBadge({ gap, sheets }: { gap: number | null; sheets: number }) {
  return <Badge variant={VARIANT[gapTone(gap, sheets)]}>{gapLabel(gap, sheets)}</Badge>;
}
