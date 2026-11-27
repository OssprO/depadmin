import { CaretRightIcon, MegaphoneIcon } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { noticesQueryOptions } from '../api';
import { publishedLine } from '../labels';

/** At most this many on the home; the rest are a tap away. */
const SHOWN = 3;

/**
 * The current notices the caller has not read, on the home (ADR-0034). Opening them marks
 * them read, and the card goes away. Nothing shows when there is nothing new.
 */
export function NoticesCard() {
  const notices = useQuery(noticesQueryOptions);
  const unread = notices.data?.notices.filter((notice) => notice.current && !notice.read) ?? [];
  if (unread.length === 0) return null;

  return (
    <Card size="sm" role="region" aria-labelledby="new-notices">
      <CardHeader>
        <CardTitle>
          <h2 id="new-notices">{unread.length === 1 ? 'Aviso nuevo' : 'Avisos nuevos'}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {unread.slice(0, SHOWN).map((notice) => (
            <li key={notice.id}>
              <Link
                to="/notices"
                className="flex items-center gap-3 py-2 [&>svg]:size-5 [&>svg]:shrink-0"
              >
                <MegaphoneIcon />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{notice.title}</span>
                  <span className="truncate text-muted-foreground">{publishedLine(notice)}</span>
                </span>
                <CaretRightIcon className="text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
        {unread.length > SHOWN && (
          <Link to="/notices" className="mt-2 block font-medium underline underline-offset-4">
            Ver los {unread.length} avisos
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
