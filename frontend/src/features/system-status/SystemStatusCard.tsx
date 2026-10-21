import { useQuery } from '@tanstack/react-query';
import { ArrowClockwiseIcon } from '@phosphor-icons/react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDuration } from '@/lib/format';
import { healthQueryOptions } from './api';

export function SystemStatusCard() {
  const health = useQuery(healthQueryOptions);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Estado del sistema</CardTitle>
        <CardAction>
          {health.isPending && <Badge variant="outline">Comprobando…</Badge>}
          {health.isSuccess && <Badge>En línea</Badge>}
          {health.isError && <Badge variant="destructive">Sin conexión</Badge>}
        </CardAction>
      </CardHeader>
      <CardContent>
        {health.isSuccess && (
          <dl className="grid grid-cols-2 gap-y-1">
            <dt className="text-muted-foreground">Versión</dt>
            <dd className="text-right">{health.data.version}</dd>
            <dt className="text-muted-foreground">Activo desde hace</dt>
            <dd className="text-right">{formatDuration(health.data.uptimeSeconds)}</dd>
          </dl>
        )}
        {health.isError && (
          <div className="flex items-center justify-between gap-4">
            <p className="text-muted-foreground">No se pudo contactar al servidor.</p>
            <Button variant="outline" size="sm" onClick={() => void health.refetch()}>
              <ArrowClockwiseIcon />
              Reintentar
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
