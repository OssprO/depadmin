import type { Unit } from '@depadmin/shared';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatMonth } from '@/lib/format';
import { unitsQueryOptions } from '../api';
import { UnitStatusSheet } from '../components/UnitStatusSheet';

function history(unit: Unit): string | null {
  if (unit.inactivePeriods.length === 0) return null;
  return unit.inactivePeriods
    .map(({ from, to }) =>
      to === null ? `desde ${formatMonth(from)}` : `de ${formatMonth(from)} a ${formatMonth(to)}`,
    )
    .join('; ');
}

export function UnitsPage() {
  const units = useQuery(unitsQueryOptions);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-lg font-bold">Deptos</h1>
      <Card>
        <CardHeader>
          <CardTitle>Activos e inactivos</CardTitle>
          <CardDescription>
            Un depto sin dueño activo no paga cuota y su turno lo cubre quien asignes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {units.isPending && <p className="text-muted-foreground">Cargando…</p>}
          {units.isError && (
            <div className="flex items-center justify-between gap-4">
              <p className="text-muted-foreground">No se pudo cargar la lista.</p>
              <Button variant="outline" size="sm" onClick={() => void units.refetch()}>
                Reintentar
              </Button>
            </div>
          )}
          {units.isSuccess && (
            <ul className="divide-y">
              {units.data.map((unit) => (
                <li key={unit.number} className="flex items-center justify-between gap-2 py-2">
                  <span className="flex flex-col gap-0.5">
                    <span className="flex items-center gap-2">
                      <span className="font-medium">Depto {unit.number}</span>
                      {unit.activeNow ? (
                        <Badge variant="outline">Activo</Badge>
                      ) : (
                        <Badge variant="secondary">Inactivo</Badge>
                      )}
                    </span>
                    {history(unit) && (
                      <span className="text-muted-foreground">Inactivo {history(unit)}</span>
                    )}
                  </span>
                  <UnitStatusSheet unit={unit} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
