import type { CurrentUser, ShiftDelegation, ShiftMonth } from '@depadmin/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatMonthRange } from '@/lib/format';
import { describeDelegation } from '../labels';
import { CancelDelegationDialog } from './CancelDelegationDialog';
import { DelegateSheet } from './DelegateSheet';

interface PeriodCardProps {
  /** The months of one scheduled period, in order. */
  readonly months: readonly ShiftMonth[];
  readonly user: CurrentUser;
  readonly isCurrent: boolean;
}

/** One scheduled shift period: who holds it, its delegations and what the viewer can do. */
export function PeriodCard({ months, user, isCurrent }: PeriodCardProps) {
  const first = months[0]!;
  const { period, scheduledUnit } = first;
  const delegations = [
    ...new Map(
      months.flatMap((m) => (m.delegation ? [[m.delegation.id, m.delegation] as const] : [])),
    ).values(),
  ];
  const uncovered = months.filter((m) => m.responsibleUnits.length === 0);
  const delegable = months.filter((m) => m.canDelegate);
  const isAdmin = user.role === 'SUPERADMIN';
  // An owner can only hand over a whole untouched period, starting with its first month.
  const canHandOver = !isAdmin && first.canDelegate;

  return (
    <Card
      size="sm"
      role="region"
      aria-label={`Turno ${formatMonthRange(period.start, period.end)}`}
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span>{formatMonthRange(period.start, period.end)}</span>
          {isCurrent && <Badge>Actual</Badge>}
        </CardTitle>
        <CardAction>
          {canHandOver && <DelegateSheet mode="handover" months={months} />}
          {isAdmin && delegable.length > 0 && <DelegateSheet mode="admin" months={delegable} />}
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <p className="text-sm font-medium">
          Depto {scheduledUnit}
          {!first.scheduledUnitActive && (
            <span className="font-normal text-muted-foreground"> · inactivo</span>
          )}
        </p>
        {delegations.map((delegation: ShiftDelegation) => (
          <div key={delegation.id} className="flex items-center justify-between gap-2">
            <p>
              {describeDelegation(delegation)}
              {delegation.from !== period.start || delegation.to !== period.end
                ? `, ${formatMonthRange(delegation.from, delegation.to)}`
                : ''}
              .
            </p>
            {isAdmin && <CancelDelegationDialog delegation={delegation} />}
          </div>
        ))}
        {uncovered.length > 0 && (
          <p className="text-destructive">
            Sin responsable en {formatMonthRange(uncovered[0]!.month, uncovered.at(-1)!.month)}: el
            superadmin debe asignar quién cubre.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
