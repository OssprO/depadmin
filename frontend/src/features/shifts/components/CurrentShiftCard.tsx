import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatMonthRange } from '@/lib/format';
import { useCurrentUser } from '@/lib/use-session';
import { currentShiftQueryOptions } from '../api';
import { describeDelegation } from '../labels';
import { Blueprint } from './Blueprint';

/** The dashboard's view of who administers the building this month. */
export function CurrentShiftCard() {
  const user = useCurrentUser();
  const shift = useQuery(currentShiftQueryOptions);

  if (shift.isPending) {
    return <p className="text-xs/relaxed text-muted-foreground">Cargando el turno…</p>;
  }
  if (shift.isError) {
    return (
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs/relaxed text-muted-foreground">No se pudo cargar el turno.</p>
        <Button variant="outline" size="sm" onClick={() => void shift.refetch()}>
          Reintentar
        </Button>
      </div>
    );
  }

  const { current, next, inactiveUnits } = shift.data;
  // The outgoing owner decides who takes the next period while they can still act.
  const pendingHandover =
    user.role === 'OWNER' ? [current, next].find((month) => month.canDelegate) : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Turno actual</CardTitle>
        <CardDescription>
          {formatMonthRange(current.period.start, current.period.end)}: Depto{' '}
          {current.scheduledUnit}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Blueprint month={current} inactiveUnits={inactiveUnits} ownUnit={user.unit} />
        {current.delegation && <p>{describeDelegation(current.delegation)}.</p>}
        {current.responsibleUnits.length === 0 && (
          <p className="text-destructive">
            Este mes no tiene responsable: el superadmin debe asignar quién cubre.
          </p>
        )}
        <p className="text-muted-foreground">
          Sigue: Depto {next.scheduledUnit}, {formatMonthRange(next.period.start, next.period.end)}
        </p>
        {pendingHandover && (
          <Alert>
            <AlertDescription className="flex flex-col gap-2">
              Si Depto {pendingHandover.scheduledUnit} no toma el turno de{' '}
              {formatMonthRange(pendingHandover.period.start, pendingHandover.period.end)},
              regístralo durante tu entrega.
              <Button size="sm" className="self-start" render={<Link to="/shifts" />}>
                Ir a Turnos
              </Button>
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
