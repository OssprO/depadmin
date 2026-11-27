import { Badge } from '@/components/ui/badge';
import { unreadText } from '../labels';

/** How many current notices wait to be read; nothing when none do. */
export function UnreadBadge({ count }: { readonly count: number }) {
  if (count === 0) return null;
  return (
    <Badge className="ml-auto">
      <span aria-hidden>{count}</span>
      {/* The comma keeps it apart from the label it follows, for screen readers. */}
      <span className="sr-only">, {unreadText(count)}</span>
    </Badge>
  );
}
