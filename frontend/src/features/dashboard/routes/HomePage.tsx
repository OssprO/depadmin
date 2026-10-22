import { CurrentShiftCard } from '@/features/shifts/components/CurrentShiftCard';
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
      <div className="empty:hidden">
        <PendingTasksCard />
      </div>
      {/* One column on the phone. From a tablet up, the shift on the left and the money on the
          right, each column stacked on its own: the shift spans every row and the last one
          (1fr) takes its extra height, so the cards on the right never drift apart. */}
      <div className="grid items-start gap-4 md:grid-cols-2 md:grid-rows-[auto_auto_1fr] lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-6">
        <div className="md:col-start-2 md:row-start-1">
          <CashCard />
        </div>
        <div className="md:col-start-1 md:row-span-3 md:row-start-1">
          <CurrentShiftCard />
        </div>
        <div className="md:col-start-2 md:row-start-2">
          <OwingCard />
        </div>
      </div>
    </div>
  );
}
