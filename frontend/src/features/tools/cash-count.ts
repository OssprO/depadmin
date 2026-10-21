/** A bill or a coin in circulation in Mexico, worth `value` centavos. */
export interface Denomination {
  readonly id: string;
  readonly kind: 'BILL' | 'COIN';
  readonly value: number;
}

const bill = (pesos: number): Denomination => ({
  id: `bill-${pesos}`,
  kind: 'BILL',
  value: pesos * 100,
});
const coin = (centavos: number): Denomination => ({
  id: `coin-${centavos}`,
  kind: 'COIN',
  value: centavos,
});

/** Bills, then coins, each from the largest. Coins under 50¢ are left out. */
export const DENOMINATIONS: readonly Denomination[] = [
  bill(1000),
  bill(500),
  bill(200),
  bill(100),
  bill(50),
  bill(20),
  coin(2000),
  coin(1000),
  coin(500),
  coin(200),
  coin(100),
  coin(50),
];

/** Enough for any count of the building's cash, short enough for the field. */
export const PIECES_MAX_DIGITS = 5;

/** What is typed in a field, kept to digits: "12", "" (nothing yet), never "1.5" or "-2". */
export function piecesInput(text: string): string {
  return text.replace(/\D/g, '').slice(0, PIECES_MAX_DIGITS);
}

/** How many pieces a field holds; blank is none. */
export function piecesOf(text: string | undefined): number {
  return text ? Number(text) : 0;
}

/** The pieces typed per denomination, by its id. */
export type CashCount = Readonly<Record<string, string>>;

/** What the pieces of one denomination add up to, in centavos. */
export function subtotalOf(denomination: Denomination, count: CashCount): number {
  return denomination.value * piecesOf(count[denomination.id]);
}

/** What every piece counted adds up to, in centavos; only `kind`, if given. */
export function totalOf(count: CashCount, kind?: Denomination['kind']): number {
  return DENOMINATIONS.filter((denomination) => !kind || denomination.kind === kind).reduce(
    (total, denomination) => total + subtotalOf(denomination, count),
    0,
  );
}

const pesos = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

/** How a denomination is written: "$1,000", "$20" or "50¢". */
export function denominationLabel({ value }: Denomination): string {
  return value < 100 ? `${value}¢` : pesos.format(value / 100).replace(/\.00$/, '');
}
