import type { RateNameValue } from '@depadmin/shared';
import { useState } from 'react';
import { FormError } from '@/components/FormError';
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
import { errorMessage } from '@/lib/error-messages';
import { formatMoney, formatMonth } from '@/lib/format';
import { useWithdrawRateChange } from '../api';
import { RATES } from '../labels';

interface WithdrawRateChangeDialogProps {
  readonly rate: RateNameValue;
  /** The month it applies from. */
  readonly from: string;
  readonly amount: number;
}

/** Takes back a scheduled change, e.g. one captured with a typo. */
export function WithdrawRateChangeDialog({ rate, from, amount }: WithdrawRateChangeDialogProps) {
  const [open, setOpen] = useState(false);
  const withdraw = useWithdrawRateChange();
  const what = `${RATES[rate].title.toLowerCase()} de ${formatMoney(amount)} desde ${formatMonth(from)}`;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) withdraw.reset();
      }}
    >
      <AlertDialogTrigger render={<Button variant="ghost" size="sm" />}>
        Quitar <span className="sr-only">el cambio de {what}</span>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Quitar el cambio?</AlertDialogTitle>
          <AlertDialogDescription>
            Se quita el cambio de {what}, y sigue el valor anterior. Queda registrado en la
            bitácora.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <FormError message={withdraw.isError ? errorMessage(withdraw.error) : null} />
        <AlertDialogFooter>
          <AlertDialogCancel>No</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={withdraw.isPending}
            onClick={() => {
              withdraw.mutate({ rate, from }, { onSuccess: () => setOpen(false) });
            }}
          >
            Sí, quitar
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
