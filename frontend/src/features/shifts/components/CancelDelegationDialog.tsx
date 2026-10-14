import type { ShiftDelegation } from '@depadmin/shared';
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
import { formatMonthRange } from '@/lib/format';
import { useCancelDelegation } from '../api';

export function CancelDelegationDialog({ delegation }: { delegation: ShiftDelegation }) {
  const [open, setOpen] = useState(false);
  const cancel = useCancelDelegation();
  const penalty = delegation.reason === 'SKIPPED_SHIFT';

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) cancel.reset();
      }}
    >
      <AlertDialogTrigger render={<Button variant="ghost" size="sm" />}>
        Cancelar
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Cancelar la delegación?</AlertDialogTitle>
          <AlertDialogDescription>
            Depto {delegation.originalUnit} vuelve a quedar a cargo de{' '}
            {formatMonthRange(delegation.from, delegation.to)}
            {penalty && ' y se le retiran las multas de esos meses'}. Queda registrado en la
            bitácora.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <FormError message={cancel.isError ? errorMessage(cancel.error) : null} />
        <AlertDialogFooter>
          <AlertDialogCancel>No</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={cancel.isPending}
            onClick={() => {
              cancel.mutate(delegation.id, { onSuccess: () => setOpen(false) });
            }}
          >
            Sí, cancelar
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
