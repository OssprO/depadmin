import { describe, expect, it } from 'vitest';
import { CashMovement } from '../../cashbook/domain/index.js';
import { expense, payment } from '../../cashbook/domain/testing.js';
import { movementsCsv } from './movements-csv.js';

describe('movementsCsv', () => {
  it('writes a spreadsheet-ready file: BOM, quoted commas and quotes, plain amounts', () => {
    const rows = [
      CashMovement.restore(
        'p',
        { ...payment('2026-10-03', 401, 1400), description: 'Pagó, "en efectivo"' },
        false,
        7,
      ),
      CashMovement.restore(
        'e',
        expense('2026-10-09', 'OTHER_EXPENSE', 520, 'Recibo del agua'),
        false,
      ),
    ];

    const csv = movementsCsv(rows);

    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv.slice(1).split('\r\n')).toEqual([
      'Fecha,Tipo,Depto,Descripción,Semana,Ingreso,Egreso,Folio',
      '2026-10-03,Pago de depto,401,"Pagó, ""en efectivo""",,1400.00,,7',
      '2026-10-09,Otro egreso,,Recibo del agua,,,520.00,',
      '',
    ]);
  });
});
