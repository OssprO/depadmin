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
import { useWithdrawNotice } from '../api';

/** Takes a notice back for everyone, e.g. one with a mistake, to publish it again. */
export function WithdrawNoticeDialog({
  id,
  title,
}: {
  readonly id: string;
  readonly title: string;
}) {
  const [open, setOpen] = useState(false);
  const withdraw = useWithdrawNotice();

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) withdraw.reset();
      }}
    >
      <AlertDialogTrigger render={<Button variant="ghost" size="sm" />}>
        Retirar <span className="sr-only">el aviso «{title}»</span>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Retirar el aviso?</AlertDialogTitle>
          <AlertDialogDescription>
            «{title}» deja de verse para todos. El correo que ya salió no se puede recoger. Queda
            registrado en la bitácora.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <FormError message={withdraw.isError ? errorMessage(withdraw.error) : null} />
        <AlertDialogFooter>
          <AlertDialogCancel>No</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={withdraw.isPending}
            onClick={() => withdraw.mutate(id, { onSuccess: () => setOpen(false) })}
          >
            Sí, retirar
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
