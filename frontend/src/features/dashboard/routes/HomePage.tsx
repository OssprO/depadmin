import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CurrentShiftCard } from '@/features/shifts/components/CurrentShiftCard';
import { SystemStatusCard } from '@/features/system-status/SystemStatusCard';
import { useCurrentUser } from '@/lib/use-session';
import { userLabel } from '@/lib/user-label';

export function HomePage() {
  const user = useCurrentUser();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-lg font-bold">Hola, {userLabel(user)}</h1>
      <CurrentShiftCard />
      <Card>
        <CardHeader>
          <CardTitle>Muy pronto</CardTitle>
          <CardDescription>Aquí verás el libro del mes, los saldos y los reportes.</CardDescription>
        </CardHeader>
        <CardContent />
      </Card>
      <SystemStatusCard />
    </div>
  );
}
