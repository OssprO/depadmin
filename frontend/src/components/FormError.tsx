import { WarningCircleIcon } from '@phosphor-icons/react';
import { Alert, AlertDescription } from '@/components/ui/alert';

/** The error of a whole form (not of one field), e.g. wrong credentials. */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <Alert variant="destructive">
      <WarningCircleIcon />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
