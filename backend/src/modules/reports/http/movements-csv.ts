import type { CashMovement } from '../../cashbook/application/index.js';

// The book's rows as CSV for a spreadsheet: UTF-8 with a byte-order mark (so Excel reads
// the accents), comma-separated with a decimal point, as spreadsheets in Mexico expect.

const TYPES: Record<CashMovement['category'], string> = {
  UNIT_PAYMENT: 'Pago de depto',
  OTHER_INCOME: 'Otro ingreso',
  GARBAGE: 'Basura',
  CLEANING: 'Limpieza',
  OTHER_EXPENSE: 'Otro egreso',
};

const HEADER = ['Fecha', 'Tipo', 'Depto', 'Descripción', 'Semana', 'Ingreso', 'Egreso', 'Folio'];

/** RFC 4180: a field with a comma, a quote or a line break goes in quotes, quotes doubled. */
function field(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/** 140000 centavos → "1400.00": no thousands separator, so it stays a number. */
const pesos = (centavos: number) => (centavos / 100).toFixed(2);

export function movementsCsv(rows: readonly CashMovement[]): string {
  const lines = rows.map((row) => {
    const { date, category, unit, description, week } = row.details;
    const income = row.direction === 'IN';
    return [
      String(date),
      TYPES[category],
      unit ? String(unit.value) : '',
      description ?? '',
      week ? String(week) : '',
      income ? pesos(row.amount.centavos) : '',
      income ? '' : pesos(row.amount.centavos),
      row.receiptNumber === null ? '' : String(row.receiptNumber),
    ]
      .map(field)
      .join(',');
  });
  return `\uFEFF${[HEADER.join(','), ...lines].join('\r\n')}\r\n`;
}
