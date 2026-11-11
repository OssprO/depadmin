import { useQuery } from '@tanstack/react-query';
import { ArrowClockwiseIcon } from '@phosphor-icons/react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDuration } from '@/lib/format';
import { healthQueryOptions } from './api';

/**
 * Whether the server answers, the version it runs and for how long. It sits at the foot of
 * the side menu, and at the foot of «Más» on the phone.
 */
export function SystemStatus() {
  const health = useQuery(healthQueryOptions);

  return (
    <section aria-labelledby="system-status" className="flex flex-col gap-2 text-xs">
      <div className="flex items-center justify-between gap-2">
        <h2 id="system-status" className="text-muted-foreground">
          Estado del sistema
        </h2>
        {health.isPending && <Badge variant="outline">Comprobando…</Badge>}
        {health.isSuccess && <Badge>En línea</Badge>}
        {health.isError && <Badge variant="destructive">Sin conexión</Badge>}
      </div>
      {health.isSuccess && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1">
          <dt className="text-muted-foreground">Versión</dt>
          <dd className="text-right tabular-nums">{health.data.version}</dd>
          <dt className="text-muted-foreground">Activo desde hace</dt>
          <dd className="text-right">{formatDuration(health.data.uptimeSeconds)}</dd>
        </dl>
      )}
      {health.isError && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-muted-foreground">No se pudo contactar al servidor.</p>
          <Button variant="outline" size="xs" onClick={() => void health.refetch()}>
            <ArrowClockwiseIcon />
            Reintentar
          </Button>
        </div>
      )}
    </section>
  );
}
