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
    // One column on the phone; from a tablet up the cards sit two by two, the pending tasks
    // first and across.
    <div className="grid items-start gap-4 md:grid-cols-2">
      <h1 className="font-heading text-lg font-bold md:col-span-2">Hola, {userLabel(user)}</h1>
      <div className="md:col-span-2 empty:hidden">
        <PendingTasksCard />
      </div>
      <CashCard />
      <CurrentShiftCard />
      <OwingCard />
      <SystemStatusCard />
    </div>
  );
}
