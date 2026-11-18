import type { Movement } from '@depadmin/shared';
import { describe, expect, it } from 'vitest';
import { describeAdministration, describeCoverage, movementTitle } from './labels';

const payment = (coverage: Movement['coverage'], amount = 140000): Movement => ({
  id: '0b9d8f5e-7c2a-4f4e-9d6b-3f1e2a7c5b10',
  date: '2026-10-03',
  category: 'UNIT_PAYMENT',
  amount,
  unit: 501,
  description: null,
  week: null,
  coverage,
  receiptNumber: null,
});

const fee = (month: string, amount: number, settles = true) =>
  ({ month, type: 'MAINTENANCE_FEE', amount, settles }) as const;

describe('movement labels', () => {
  it('names the row by who paid or what it was', () => {
    expect(movementTitle(payment([]))).toBe('Pago Depto 501');
    expect(movementTitle({ ...payment([]), category: 'GARBAGE', unit: null, coverage: [] })).toBe(
      'Basura',
    );
    expect(
      movementTitle({ ...payment([]), category: 'OTHER_EXPENSE', unit: null, description: 'Foco' }),
    ).toBe('Foco');
  });

  it('says what a payment covered', () => {
    expect(describeCoverage(payment([fee('2026-09', 70000), fee('2026-10', 70000)]))).toBe(
      'cubre sep y oct',
    );
    expect(
      describeCoverage(payment([fee('2026-08', 70000), fee('2026-09', 30000, false)], 100000)),
    ).toBe('cubre ago y abono a sep');
    expect(describeCoverage(payment([fee('2026-10', 70000)], 100000))).toBe('cubre oct y adelanto');
    expect(describeCoverage(payment([], 70000))).toBe('adelanto');
    expect(
      describeCoverage(
        payment(
          [
            fee('2025-12', 70000),
            { month: '2026-10', type: 'SHIFT_SKIP_PENALTY', amount: 50000, settles: true },
          ],
          120000,
        ),
      ),
    ).toBe('cubre dic 2025 y multa de oct');
    expect(describeCoverage({ ...payment([]), category: 'CLEANING' })).toBeNull();
  });
});

describe('describeAdministration', () => {
  const shift = (scheduledUnit: 401 | 502, responsibleUnits: (401 | 402 | 502)[]) => ({
    scheduledUnit,
    responsibleUnits,
  });

  it('names the depto, and the one covering it, in the present while the month is open', () => {
    expect(describeAdministration({ administration: shift(502, [502]), status: 'OPEN' })).toBe(
      'Administra Depto 502',
    );
    expect(
      describeAdministration({ administration: shift(401, [401, 402]), status: 'CLOSED' }),
    ).toBe('Turno de Depto 401, cubrió Depto 402');
    expect(describeAdministration({ administration: shift(401, []), status: 'OPEN' })).toBe(
      'Turno de Depto 401, sin responsable',
    );
    expect(describeAdministration({ administration: null, status: 'CLOSED' })).toBeNull();
  });
});
