import { ArrowCounterClockwiseIcon } from '@phosphor-icons/react';
import { type KeyboardEvent, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  type CashCount,
  DENOMINATIONS,
  type Denomination,
  denominationLabel,
  piecesInput,
  subtotalOf,
  totalOf,
} from '../cash-count';

const KINDS = {
  BILL: 'Billetes',
  COIN: 'Monedas',
} as const satisfies Record<Denomination['kind'], string>;

interface RowProps {
  readonly denomination: Denomination;
  readonly count: CashCount;
  readonly last: boolean;
  readonly onChange: (text: string) => void;
  readonly onNext: () => void;
  readonly inputRef: (input: HTMLInputElement | null) => void;
}

function DenominationRow({ denomination, count, last, onChange, onNext, inputRef }: RowProps) {
  const id = `pieces-${denomination.id}`;
  const subtotal = subtotalOf(denomination, count);
  return (
    <li className="grid grid-cols-[4.5rem_minmax(0,1fr)_7rem] items-center gap-3 py-2">
      <label htmlFor={id} className="text-base font-medium tabular-nums">
        {/* "$20" is a bill and a coin: the name says which. */}
        <span className="sr-only">{KINDS[denomination.kind]} de </span>
        {denominationLabel(denomination)}
      </label>
      <Input
        id={id}
        ref={inputRef}
        value={count[denomination.id] ?? ''}
        onChange={(event) => onChange(piecesInput(event.target.value))}
        onFocus={(event) => event.target.select()}
        onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          onNext();
        }}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        enterKeyHint={last ? 'done' : 'next'}
        autoComplete="off"
        placeholder="0"
        className="h-12 text-right text-lg tabular-nums md:h-10 md:text-base"
      />
      <span className={cn('text-right tabular-nums', subtotal === 0 && 'text-muted-foreground')}>
        {formatMoney(subtotal)}
      </span>
    </li>
  );
}

/**
 * Counts the cash in the box: pieces per bill and coin, added up as they are typed, in
 * centavos. Only a utility: nothing is saved or sent, so it needs no connection.
 */
export function CashCounterPage() {
  const [count, setCount] = useState<CashCount>({});
  const inputs = useRef(new Map<string, HTMLInputElement>());
  const empty = Object.values(count).every((pieces) => !pieces);

  const focus = (index: number) => {
    const next = DENOMINATIONS[index];
    if (next) inputs.current.get(next.id)?.focus();
    // After the last field, close the phone's keyboard so the total shows.
    else (document.activeElement as HTMLElement | null)?.blur();
  };

  const clear = () => {
    setCount({});
    focus(0);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-lg font-bold">Contador de efectivo</h1>
        <p className="text-muted-foreground">
          Escribe cuántas piezas hay de cada una; la suma se hace sola. No se guarda nada.
        </p>
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        {(Object.keys(KINDS) as Denomination['kind'][]).map((kind) => (
          <Card key={kind} size="sm">
            <CardHeader>
              <CardTitle>
                <h2>{KINDS[kind]}</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                {DENOMINATIONS.map((denomination, index) =>
                  denomination.kind === kind ? (
                    <DenominationRow
                      key={denomination.id}
                      denomination={denomination}
                      count={count}
                      last={index === DENOMINATIONS.length - 1}
                      onChange={(pieces) =>
                        setCount((current) => ({ ...current, [denomination.id]: pieces }))
                      }
                      onNext={() => focus(index + 1)}
                      inputRef={(input) => {
                        if (input) inputs.current.set(denomination.id, input);
                        else inputs.current.delete(denomination.id);
                      }}
                    />
                  ) : null,
                )}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="flex flex-col gap-3">
          <dl className="flex flex-col gap-1">
            {(Object.keys(KINDS) as Denomination['kind'][]).map((kind) => (
              <div key={kind} className="flex justify-between gap-2">
                <dt className="text-muted-foreground">{KINDS[kind]}</dt>
                <dd className="tabular-nums">{formatMoney(totalOf(count, kind))}</dd>
              </div>
            ))}
            <div
              className="flex items-baseline justify-between gap-2 border-t pt-2"
              aria-live="polite"
              aria-atomic
            >
              <dt className="text-base font-medium">Total</dt>
              <dd className="font-heading text-2xl font-bold tabular-nums">
                {formatMoney(totalOf(count))}
              </dd>
            </div>
          </dl>
          <Button variant="outline" size="lg" disabled={empty} onClick={clear}>
            <ArrowCounterClockwiseIcon /> Limpiar
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
