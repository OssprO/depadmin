import type { Notice } from '@depadmin/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useMarkNoticesRead, noticesQueryOptions } from '../api';
import { NoticeItem } from '../components/NoticeItem';
import { PublishNoticeSheet } from '../components/PublishNoticeSheet';

/**
 * The building's notices (ADR-0034): the current ones, then those past their last day.
 * Opening the screen marks what it shows as read, and «Nuevo» stays on them until it closes.
 */
export function NoticesPage() {
  const notices = useQuery(noticesQueryOptions);
  const { mutate: markRead } = useMarkNoticesRead();
  // What was unread when the screen opened, taken once (React's "adjust state while
  // rendering"): reading them refreshes the list, and they keep their «Nuevo» meanwhile.
  const [fresh, setFresh] = useState<ReadonlySet<string> | null>(null);
  if (notices.data && fresh === null) {
    setFresh(new Set(notices.data.notices.filter((n) => !n.read).map((n) => n.id)));
  }
  useEffect(() => {
    if (fresh?.size) markRead([...fresh]);
  }, [fresh, markRead]);

  const current = notices.data?.notices.filter((notice) => notice.current) ?? [];
  const earlier = notices.data?.notices.filter((notice) => !notice.current) ?? [];
  const canPublish = notices.data?.canPublish ?? false;
  const item = (notice: Notice) => (
    <li key={notice.id}>
      <NoticeItem
        notice={notice}
        fresh={!notice.read || !!fresh?.has(notice.id)}
        canWithdraw={canPublish}
      />
    </li>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-lg font-bold">Avisos</h1>
        {canPublish && <PublishNoticeSheet />}
      </div>
      {notices.isPending && <p className="text-muted-foreground">Cargando…</p>}
      {notices.isError && (
        <div className="flex items-center justify-between gap-4">
          <p className="text-muted-foreground">No se pudieron cargar los avisos.</p>
          <Button variant="outline" size="sm" onClick={() => void notices.refetch()}>
            Reintentar
          </Button>
        </div>
      )}
      {notices.isSuccess && (
        <>
          <section aria-labelledby="current-notices" className="flex flex-col gap-3">
            <h2 id="current-notices" className="font-heading font-semibold">
              Vigentes
            </h2>
            {current.length === 0 ? (
              <p className="text-muted-foreground">No hay avisos vigentes.</p>
            ) : (
              <ul className="flex flex-col gap-3">{current.map(item)}</ul>
            )}
          </section>
          {earlier.length > 0 && (
            <section aria-labelledby="earlier-notices" className="flex flex-col gap-3">
              <h2 id="earlier-notices" className="font-heading font-semibold">
                Anteriores
              </h2>
              <ul className="flex flex-col gap-3">{earlier.map(item)}</ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
