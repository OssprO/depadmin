import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { reportingStartQueryOptions } from '../api';
import { ReportingStartForm } from '../components/ReportingStartForm';

export function ReportingStartPage() {
  const start = useQuery(reportingStartQueryOptions);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-lg font-bold">Inicio de la contabilidad</h1>
      <Card>
        <CardHeader>
          <CardTitle>Desde dónde empiezan las cuentas</CardTitle>
          <CardDescription>
            El primer mes que se lleva en la app y el efectivo que había en caja ese día 1. Los
            saldos de cada mes se calculan a partir de aquí.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {start.isPending && <p className="text-muted-foreground">Cargando…</p>}
          {start.isError && (
            <Button variant="outline" size="sm" onClick={() => void start.refetch()}>
              Reintentar
            </Button>
          )}
          {start.isSuccess && <ReportingStartForm start={start.data.start} />}
        </CardContent>
      </Card>
    </div>
  );
}
