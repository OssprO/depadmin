import { describe, expect, it } from 'vitest';
import { LocalDate, Money, UnitNumber, YearMonth } from '../../../../shared-kernel/index.js';
import { balanceText, coverageText, folioText, longDate, recorderText } from './account-format.js';

const pesos = (amount: number) => Money.ofPesos(amount);

describe('receipt and statement text', () => {
  it('writes the folio, the date and each charge a payment covered', () => {
    expect(folioText(42)).toBe('FOLIO 0042');
    expect(folioText(12345)).toBe('FOLIO 12345');
    expect(longDate(LocalDate.parse('2026-10-03'))).toBe('3 DE OCTUBRE DE 2026');
    const october = YearMonth.parse('2026-10');
    expect(
      coverageText({ month: october, type: 'MAINTENANCE_FEE', amount: pesos(700), settles: true }),
    ).toBe('CUOTA OCTUBRE 2026');
    expect(
      coverageText({ month: october, type: 'MAINTENANCE_FEE', amount: pesos(300), settles: false }),
    ).toBe('ABONO A CUOTA OCTUBRE 2026');
    // What an earlier payment left of the fee.
    expect(
      coverageText(
        { month: october, type: 'MAINTENANCE_FEE', amount: pesos(400), settles: true },
        pesos(700),
      ),
    ).toBe('LIQUIDA CUOTA OCTUBRE 2026');
    expect(
      coverageText({
        month: october,
        type: 'SHIFT_SKIP_PENALTY',
        amount: pesos(500),
        settles: true,
      }),
    ).toBe('MULTA POR NO TOMAR EL TURNO OCTUBRE 2026');
  });

  it('says how the account stands, and who recorded the payment', () => {
    expect(balanceText({ outstanding: Money.ZERO, credit: Money.ZERO })).toBe('AL CORRIENTE');
    expect(balanceText({ outstanding: pesos(400), credit: Money.ZERO })).toBe('ADEUDA $400.00');
    expect(balanceText({ outstanding: Money.ZERO, credit: pesos(1400) })).toBe(
      'ADELANTO $1,400.00',
    );
    expect(recorderText({ role: 'OWNER', unit: UnitNumber.of(502) })).toBe('DEPTO 502');
    expect(recorderText({ role: 'SUPERADMIN' })).toBe('SUPERADMIN');
    expect(recorderText(null)).toBeNull();
  });
});
