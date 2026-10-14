import { CaretRightIcon } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { accountsQueryOptions } from '@/features/accounts/api';
import { formatMoney } from '@/lib/format';

/** The deptos that owe, largest debt first. Everyone sees them (spec 5: full read access). */
export function OwingCard() {
  const accounts = useQuery(accountsQueryOptions);
  if (accounts.isPending || accounts.isError) return null;

  const owing = accounts.data
    .filter((account) => account.outstanding > 0)
    .sort((a, b) => b.outstanding - a.outstanding);
  return (
    <Card size="sm" role="region" aria-labelledby="owing">
      <CardHeader>
        <CardTitle>
          <h2 id="owing">Deptos con adeudo</h2>
        </CardTitle>
        {owing.length === 0 && <CardDescription>Todos al corriente.</CardDescription>}
        <CardAction>
          <Button variant="ghost" size="sm" render={<Link to="/accounts" />}>
            Ver todos
          </Button>
        </CardAction>
      </CardHeader>
      {owing.length > 0 && (
        <CardContent>
          <ul className="divide-y">
            {owing.map((account) => (
              <li key={account.unit}>
                <Link
                  to="/accounts/$unit"
                  params={{ unit: account.unit }}
                  className="flex items-center gap-3 py-2"
                >
                  <span className="flex-1">Depto {account.unit}</span>
                  <span className="text-destructive tabular-nums">
                    debe {formatMoney(account.outstanding)}
                  </span>
                  <CaretRightIcon className="text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </CardContent>
      )}
    </Card>
  );
}
