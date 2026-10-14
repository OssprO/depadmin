import type { MonthlyReport } from '@depadmin/shared';
import { Link } from '@tanstack/react-router';
import { FormError } from '@/components/FormError';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { errorMessage } from '@/lib/error-messages';
import { formatMonth } from '@/lib/format';
import { useCurrentUser } from '@/lib/use-session';
import { useOpenMonth } from '../api';

/** A month with nothing recorded yet: the books may not have started, or it is not open. */
export function OpenMonthCard({ report }: { report: MonthlyReport }) {
  const user = useCurrentUser();
  const open = useOpenMonth();

  if (!report.reportingStarted) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>La contabilidad aún no empieza</CardTitle>
          <CardDescription>
            Primero se captura el mes de inicio y el efectivo en caja de ese momento.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {user.role === 'SUPERADMIN' ? (
            <Button render={<Link to="/admin/start" />}>Capturar el inicio</Button>
          ) : (
            <p className="text-muted-foreground">El superadmin debe capturarlo.</p>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{formatMonth(report.month)} no se ha abierto</CardTitle>
        <CardDescription>
          Al abrirlo se cargan las cuotas del mes a los deptos activos y ya se pueden anotar pagos y
          gastos.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {report.canOpen ? (
          <Button
            className="self-start"
            disabled={open.isPending}
            onClick={() => open.mutate(report.month)}
          >
            Abrir el mes
          </Button>
        ) : (
          <p className="text-muted-foreground">
            Lo abre el depto en turno (o el superadmin) a partir del día 1.
          </p>
        )}
        <FormError message={open.isError ? errorMessage(open.error) : null} />
      </CardContent>
    </Card>
  );
}
