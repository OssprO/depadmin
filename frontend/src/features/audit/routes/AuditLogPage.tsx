import type { AuditLogEntry } from '@depadmin/shared';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { dayKey, formatDay } from '@/lib/format';
import { auditLogQueryOptions } from '../api';
import { AuditEntryItem } from '../components/AuditEntryItem';
import { AuditFilters } from '../components/AuditFilters';
import type { AuditLogFilters } from '../filters';

interface AuditLogPageProps {
  readonly filters: AuditLogFilters;
  readonly onFiltersChange: (filters: AuditLogFilters) => void;
}

/** Entries are newest first, so consecutive ones share a day. */
function byDay(entries: readonly AuditLogEntry[]) {
  const days: { key: string; entries: AuditLogEntry[] }[] = [];
  for (const entry of entries) {
    const key = dayKey(entry.occurredAt);
    const last = days.at(-1);
    if (last?.key === key) last.entries.push(entry);
    else days.push({ key, entries: [entry] });
  }
  return days;
}

/** Every change to the records, read-only and visible to everyone (spec: full read access). */
export function AuditLogPage({ filters, onFiltersChange }: AuditLogPageProps) {
  const log = useInfiniteQuery(auditLogQueryOptions(filters));
  const entries = log.data?.pages.flatMap((page) => page.entries) ?? [];
  const filtered = Object.keys(filters).length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-heading text-lg font-bold">Bitácora</h1>
        <p className="text-xs/relaxed text-muted-foreground">
          Cada cambio queda registrado: quién, cuándo y qué valores cambió. Nadie puede editarla.
        </p>
      </div>
      <AuditFilters filters={filters} onChange={onFiltersChange} />

      {log.isPending && <p className="text-xs/relaxed text-muted-foreground">Cargando…</p>}
      {log.isError && (
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs/relaxed text-muted-foreground">No se pudo cargar la bitácora.</p>
          <Button variant="outline" size="sm" onClick={() => void log.refetch()}>
            Reintentar
          </Button>
        </div>
      )}
      {log.isSuccess && entries.length === 0 && (
        <p className="text-xs/relaxed text-muted-foreground">
          {filtered ? 'No hay cambios con estos filtros.' : 'Aún no hay cambios registrados.'}
        </p>
      )}

      {byDay(entries).map((day) => (
        <Card key={day.key} size="sm">
          <CardHeader>
            <CardTitle>
              <h2 className="first-letter:uppercase">{formatDay(day.entries[0]!.occurredAt)}</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {day.entries.map((entry) => (
                <AuditEntryItem key={entry.id} entry={entry} />
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}

      {log.hasNextPage && (
        <Button
          variant="outline"
          disabled={log.isFetchingNextPage}
          onClick={() => void log.fetchNextPage()}
        >
          {log.isFetchingNextPage ? 'Cargando…' : 'Ver más'}
        </Button>
      )}
    </div>
  );
}
