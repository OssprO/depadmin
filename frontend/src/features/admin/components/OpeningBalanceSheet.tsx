import {
  type ChargeType,
  type OpeningBalance,
  openingBalanceRequestSchema,
} from '@depadmin/shared';
import { PlusIcon, XIcon } from '@phosphor-icons/react';
import { useState } from 'react';
import { FormError } from '@/components/FormError';
import { FormSheetContent } from '@/components/FormSheetContent';
import { Button } from '@/components/ui/button';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import {
  Sheet,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { errorMessage } from '@/lib/error-messages';
import { addMonths, formatMoney, formatMonth, parsePesos, pesosInput } from '@/lib/format';
import { useSetOpeningBalance } from '../api';

/** A debt as the form edits it: amounts as typed. */
interface DebtRow {
  readonly key: number;
  readonly month: string;
  readonly type: ChargeType;
  readonly amount: string;
}

const TYPES: Record<ChargeType, string> = {
  MAINTENANCE_FEE: 'Cuota',
  SHIFT_SKIP_PENALTY: 'Multa por no llevar la administración',
};

let nextKey = 0;
const row = (month: string, type: ChargeType, amount: string): DebtRow => ({
  key: nextKey++,
  month,
  type,
  amount,
});

interface OpeningBalanceSheetProps {
  readonly balance: OpeningBalance;
  /** The first month of the books: every debt is from before it. */
  readonly start: string;
  readonly onClose: () => void;
}

/**
 * One depto's opening balance: its debts from before the books, month by month (a partly
 * paid month is what was left of it), and the adelanto it had paid. Saved as a whole.
 */
export function OpeningBalanceSheet({ balance, start, onClose }: OpeningBalanceSheetProps) {
  const save = useSetOpeningBalance();
  const lastMonth = addMonths(start, -1);
  const [debts, setDebts] = useState<DebtRow[]>(() =>
    balance.debts.map((debt) => row(debt.month, debt.type, pesosInput(debt.amount))),
  );
  const [credit, setCredit] = useState(balance.credit ? pesosInput(balance.credit) : '');
  const [range, setRange] = useState({ from: '', to: lastMonth, fee: '700' });
  const [invalid, setInvalid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const change = (key: number, patch: Partial<DebtRow>) =>
    setDebts((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  /** One row per month of the range, at the fee given: the usual case of whole months. */
  const addRange = () => {
    if (!range.from || !range.to || range.from > range.to) return;
    const added: DebtRow[] = [];
    for (let month = range.from; month <= range.to; month = addMonths(month, 1)) {
      if (!debts.some((d) => d.month === month && d.type === 'MAINTENANCE_FEE')) {
        added.push(row(month, 'MAINTENANCE_FEE', range.fee));
      }
    }
    setDebts((rows) => [...rows, ...added].sort((a, b) => a.month.localeCompare(b.month)));
  };

  const total = debts.reduce((sum, d) => sum + (parsePesos(d.amount) || 0), 0);

  const submit = async () => {
    setError(null);
    const body = openingBalanceRequestSchema.safeParse({
      debts: debts.map((d) => ({ month: d.month, type: d.type, amount: parsePesos(d.amount) })),
      credit: credit.trim() === '' ? 0 : parsePesos(credit),
    });
    if (!body.success) {
      setInvalid(body.error.issues[0]?.message ?? 'Revisa los datos');
      return;
    }
    setInvalid(null);
    try {
      await save.mutateAsync({ unit: balance.unit, ...body.data });
      onClose();
    } catch (failure) {
      setError(errorMessage(failure));
    }
  };

  return (
    <Sheet
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <FormSheetContent>
        <SheetHeader>
          <SheetTitle>Depto {balance.unit} al empezar</SheetTitle>
          <SheetDescription>
            Lo que debía y lo que tenía adelantado antes de {formatMonth(start)}.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-5 px-4">
          <FieldSet>
            <FieldLegend variant="label">Adeudos</FieldLegend>
            {debts.length === 0 && <p className="text-muted-foreground">No debía nada.</p>}
            <ul className="flex flex-col gap-3">
              {debts.map((debt, index) => (
                <li
                  key={debt.key}
                  className="grid grid-cols-[1fr_6rem_auto] items-center gap-2 border-b pb-3"
                >
                  <Input
                    type="month"
                    aria-label={`Mes del adeudo ${index + 1}`}
                    max={lastMonth}
                    value={debt.month}
                    onChange={(event) => change(debt.key, { month: event.target.value })}
                  />
                  <Input
                    inputMode="decimal"
                    placeholder="$"
                    aria-label={`Importe del adeudo ${index + 1} ($)`}
                    value={debt.amount}
                    aria-invalid={debt.amount !== '' && Number.isNaN(parsePesos(debt.amount))}
                    onChange={(event) => change(debt.key, { amount: event.target.value })}
                  />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Quitar el adeudo ${index + 1}`}
                    onClick={() => setDebts((rows) => rows.filter((r) => r.key !== debt.key))}
                  >
                    <XIcon />
                  </Button>
                  <NativeSelect
                    className="col-span-2 w-full"
                    size="sm"
                    aria-label={`Concepto del adeudo ${index + 1}`}
                    value={debt.type}
                    onChange={(event) =>
                      change(debt.key, { type: event.target.value as ChargeType })
                    }
                  >
                    {Object.entries(TYPES).map(([type, label]) => (
                      <NativeSelectOption key={type} value={type}>
                        {label}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </li>
              ))}
            </ul>
            <Button
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => setDebts((rows) => [...rows, row(lastMonth, 'MAINTENANCE_FEE', '')])}
            >
              <PlusIcon /> Agregar un adeudo
            </Button>
            <FieldDescription>Total: {formatMoney(total)}</FieldDescription>
          </FieldSet>

          <FieldSet>
            <FieldLegend variant="label">Varios meses completos</FieldLegend>
            <div className="grid grid-cols-2 gap-2">
              <Field>
                <FieldLabel htmlFor="range-from">Desde</FieldLabel>
                <Input
                  id="range-from"
                  type="month"
                  max={lastMonth}
                  value={range.from}
                  onChange={(event) => setRange({ ...range, from: event.target.value })}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="range-to">Hasta</FieldLabel>
                <Input
                  id="range-to"
                  type="month"
                  max={lastMonth}
                  value={range.to}
                  onChange={(event) => setRange({ ...range, to: event.target.value })}
                />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="range-fee">Cuota de cada mes ($)</FieldLabel>
              <Input
                id="range-fee"
                inputMode="decimal"
                value={range.fee}
                onChange={(event) => setRange({ ...range, fee: event.target.value })}
              />
            </Field>
            <Button variant="outline" size="sm" className="self-start" onClick={addRange}>
              <PlusIcon /> Agregar esos meses
            </Button>
          </FieldSet>

          <Field data-invalid={credit.trim() !== '' && Number.isNaN(parsePesos(credit))}>
            <FieldLabel htmlFor="opening-credit">Adelanto ($)</FieldLabel>
            <Input
              id="opening-credit"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0"
              value={credit}
              onChange={(event) => setCredit(event.target.value)}
            />
            <FieldDescription>Lo que había pagado por meses que aún no llegaban.</FieldDescription>
          </Field>
          {invalid && <FieldError>{invalid}</FieldError>}
          <FormError message={error} />
        </div>
        <SheetFooter>
          <Button disabled={save.isPending} onClick={() => void submit()}>
            Guardar
          </Button>
        </SheetFooter>
      </FormSheetContent>
    </Sheet>
  );
}
