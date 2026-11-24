import type { MonthlyReport } from '@depadmin/shared';
import { MonthStatusBadge } from '@/components/MonthStatusBadge';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { describeAdministration } from '../labels';

/** The report in four figures, always in view above the list. */
export function MonthSummary({ report }: { report: MonthlyReport }) {
  const { balances, totals } = report;
  if (!balances) return null;
  const administeredBy = describeAdministration(report);
  const line = (label: string, amount: string, strong = false, accent?: 'income' | 'expense') => (
    <div
      className={cn(
        'flex justify-between gap-2',
        accent && 'border-r-4 pr-2',
        accent === 'income' && 'border-r-income',
        accent === 'expense' && 'border-r-expense',
      )}
    >
      <dt className={strong ? 'font-medium' : 'text-muted-foreground'}>{label}</dt>
      <dd className={`tabular-nums ${strong ? 'text-sm font-bold' : ''}`}>{amount}</dd>
    </div>
  );

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Resumen</CardTitle>
        {administeredBy && <CardDescription>{administeredBy}</CardDescription>}
        <CardAction>
          <MonthStatusBadge status={report.status} />
        </CardAction>
      </CardHeader>
      <CardContent>
        <dl className="flex flex-col gap-1">
          {line('Saldo inicial', formatMoney(balances.opening))}
          {line('Ingresos', `+ ${formatMoney(totals.income)}`, false, 'income')}
          {line('Egresos', `− ${formatMoney(totals.expense)}`, false, 'expense')}
          {line(
            report.status === 'CLOSED' ? 'Saldo final' : 'Saldo actual',
            formatMoney(balances.closing),
            true,
          )}
        </dl>
      </CardContent>
    </Card>
  );
}
