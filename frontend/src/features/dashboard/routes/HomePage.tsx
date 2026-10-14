import { CurrentShiftCard } from '@/features/shifts/components/CurrentShiftCard';
import { SystemStatusCard } from '@/features/system-status/SystemStatusCard';
import { useCurrentUser } from '@/lib/use-session';
import { userLabel } from '@/lib/user-label';
import { CashCard } from '../components/CashCard';
import { OwingCard } from '../components/OwingCard';
import { PendingTasksCard } from '../components/PendingTasksCard';

/** The dashboard: what to do now, the cash, who administers the building and who owes. */
export function HomePage() {
  const user = useCurrentUser();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-lg font-bold">Hola, {userLabel(user)}</h1>
      <PendingTasksCard />
      <CashCard />
      <CurrentShiftCard />
      <OwingCard />
      <SystemStatusCard />
    </div>
  );
}
