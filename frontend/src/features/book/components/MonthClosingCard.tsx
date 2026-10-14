import type { MonthlyReport } from '@depadmin/shared';
import { LockKeyIcon, LockKeyOpenIcon, WarningIcon } from '@phosphor-icons/react';
import type { UseMutationResult } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { FormError } from '@/components/FormError';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { errorMessage } from '@/lib/error-messages';
import { addMonths, formatMoney, formatMonth, formatMonthName, formatWeek } from '@/lib/format';
import { useCloseMonth, useReopenMonth } from '../api';

/**
 * The end of a month's life in the book: closing it once it is over (its outgoing owner in
 * the handover, or the superadmin), or reopening it (the superadmin only).
 */
export function MonthClosingCard({ report }: { report: MonthlyReport }) {
  if (report.canClose) return <CloseMonth report={report} />;
  if (report.canReopen) return <ReopenMonth report={report} />;
  return null;
}

function CloseMonth({ report }: { report: MonthlyReport }) {
  const close = useCloseMonth();
  const month = formatMonth(report.month);
  // Once the month is over, every week of it has begun: what is not paid is pending.
  const unpaid = report.garbageWeeks.filter((week) => week.status === 'PENDING');

  return (
    <Card size="sm" role="region" aria-labelledby="month-closing">
      <CardHeader>
        <CardTitle>
          <h2 id="month-closing">Cierre del mes</h2>
        </CardTitle>
        <CardDescription>
          El mes ya terminó. Revisa que todo cuadre y ciérralo: la lista se congela y el saldo final
          pasa a {formatMonthName(addMonths(report.month, 1))}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Confirm
          mutation={close}
          month={report.month}
          trigger={
            <>
              <LockKeyIcon /> Cerrar el mes
            </>
          }
          title={`¿Cerrar ${month}?`}
          confirm="Cerrar el mes"
          warning={
            unpaid.length > 0 && (
              <Alert>
                <WarningIcon />
                <AlertDescription>
                  {unpaid.length === 1
                    ? 'Queda 1 semana de basura sin registrar'
                    : `Quedan ${unpaid.length} semanas de basura sin registrar`}
                  : {unpaid.map((week) => formatWeek(week.week)).join(', ')}. Si ya se pagaron,
                  regístralas antes de cerrar.
                </AlertDescription>
              </Alert>
            )
          }
        >
          Saldo final: {report.balances && formatMoney(report.balances.closing)}. La lista queda
          congelada y solo el superadmin puede reabrirla.
        </Confirm>
      </CardContent>
    </Card>
  );
}

function ReopenMonth({ report }: { report: MonthlyReport }) {
  const reopen = useReopenMonth();
  const month = formatMonth(report.month);

  return (
    <Card size="sm" role="region" aria-labelledby="month-closing">
      <CardHeader>
        <CardTitle>
          <h2 id="month-closing">Mes cerrado</h2>
        </CardTitle>
        <CardDescription>Solo tú puedes reabrirlo, para corregir algo.</CardDescription>
      </CardHeader>
      <CardContent>
        <Confirm
          mutation={reopen}
          month={report.month}
          variant="outline"
          trigger={
            <>
              <LockKeyOpenIcon /> Reabrir el mes
            </>
          }
          title={`¿Reabrir ${month}?`}
          confirm="Reabrir"
        >
          Se podrá editar otra vez. Al cerrarlo de nuevo se recalculan los saldos de los meses
          cerrados que le siguen. Queda registrado en la bitácora.
        </Confirm>
      </CardContent>
    </Card>
  );
}

interface ConfirmProps {
  readonly mutation: UseMutationResult<void, Error, string>;
  readonly month: string;
  readonly trigger: ReactNode;
  readonly variant?: 'default' | 'outline';
  readonly title: string;
  readonly confirm: string;
  readonly warning?: ReactNode;
  readonly children: ReactNode;
}

/** A button that asks before doing something hard to undo to the month. */
function Confirm({
  mutation,
  month,
  trigger,
  variant = 'default',
  title,
  confirm,
  warning,
  children,
}: ConfirmProps) {
  const [open, setOpen] = useState(false);

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) mutation.reset();
      }}
    >
      <AlertDialogTrigger render={<Button variant={variant} className="self-start" />}>
        {trigger}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{children}</AlertDialogDescription>
        </AlertDialogHeader>
        {warning}
        <FormError message={mutation.isError ? errorMessage(mutation.error) : null} />
        <AlertDialogFooter>
          <AlertDialogCancel>Todavía no</AlertDialogCancel>
          <Button
            disabled={mutation.isPending}
            onClick={() => mutation.mutate(month, { onSuccess: () => setOpen(false) })}
          >
            {confirm}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
