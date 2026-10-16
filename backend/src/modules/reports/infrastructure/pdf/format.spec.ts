import { describe, expect, it } from 'vitest';
import {
  Instant,
  LocalDate,
  Money,
  UnitNumber,
  YearMonth,
} from '../../../../shared-kernel/index.js';
import type { ChargeType } from '../../../billing/application/index.js';
import type { OwedCharge, UnitReportLine } from '../../application/index.js';
import {
  currentFeeTone,
  dayMonth,
  money,
  monthTitle,
  observations,
  observationsCell,
  owedText,
  timestamp,
  visitDays,
  weekLabel,
} from './format.js';

// The cases come from the building's own reports ("Balance Correspondencia 63").

const m = (text: string) => YearMonth.parse(text);
const d = (text: string) => LocalDate.parse(text);
const pesos = (amount: number) => Money.ofPesos(amount);
const fee = pesos(700);

const owedFee = (month: string, amount = 700): OwedCharge => ({
  month: m(month),
  type: 'MAINTENANCE_FEE',
  amount: pesos(amount),
  whole: amount === 700,
});
const owedMonths = (from: string, to: string) =>
  m(from)
    .through(m(to))
    .map((month) => owedFee(String(month)));
const covered = (
  month: string,
  settles = true,
  type: ChargeType = 'MAINTENANCE_FEE',
  amount = 700,
) => ({
  month: m(month),
  type,
  amount: pesos(amount),
  settles,
});

/** A depto's line in `month`, paying `paid` this month; override what matters. */
function line(month: string, overrides: Partial<UnitReportLine> = {}): UnitReportLine {
  return {
    unit: UnitNumber.of(301),
    ownerName: null,
    active: true,
    currentFee: {
      amount: fee,
      paidThisMonth: fee,
      paidBefore: Money.ZERO,
      paidBeforeIn: null,
      outstanding: Money.ZERO,
    },
    paid: fee,
    advanced: Money.ZERO,
    covered: [covered(month)],
    owed: [],
    outstanding: Money.ZERO,
    credit: Money.ZERO,
    paper: null,
    notes: [],
    ...overrides,
  };
}
const unpaidFee = {
  amount: fee,
  paidThisMonth: Money.ZERO,
  paidBefore: Money.ZERO,
  paidBeforeIn: null,
  outstanding: fee,
};

describe('report text', () => {
  it('writes money, months, weeks and days the way the sheets do', () => {
    expect(money(Money.ofCentavos(1_786_293))).toBe('$17,862.93');
    expect(monthTitle(m('2026-04'))).toBe('ABRIL 2026');
    expect(dayMonth(d('2026-04-07'))).toBe('07-abr');
    expect(weekLabel(d('2026-03-30'))).toBe('SEMANA DEL 30 AL 5');
    expect(visitDays([d('2026-04-06'), d('2026-04-08'), d('2026-04-10')])).toBe('06, 08 Y 10');
    expect(timestamp(Instant.ofEpochMillis(Date.parse('2026-10-03T18:05:00Z')))).toBe(
      '3 oct 2026, 12:05',
    );
  });

  it('says what is owed: simply for whole months in a row, itemized otherwise', () => {
    expect(owedText([])).toBeNull();
    expect(owedText([owedFee('2026-04')])).toBe('ADEUDA ABRIL');
    expect(owedText(owedMonths('2024-12', '2025-01'))).toBe('ADEUDA DICIEMBRE Y ENERO');
    expect(owedText(owedMonths('2026-02', '2026-04'))).toBe(
      'ADEUDA DE FEBRERO A ABRIL (3 MESES) TOTAL 2,100',
    );
    // 301 in August 2026.
    expect(
      owedText([
        owedFee('2025-08', 600),
        ...owedMonths('2025-09', '2026-08'),
        { month: m('2026-06'), type: 'SHIFT_SKIP_PENALTY', amount: pesos(500), whole: true },
        { month: m('2026-07'), type: 'SHIFT_SKIP_PENALTY', amount: pesos(500), whole: true },
      ]),
    ).toBe(
      "ADEUDA 10,000 | 600 DE AGO '25 + 8,400 DE SEP '25 A AGO '26 + 1,000 POR NO LLEVAR ADMINISTRACIÓN",
    );
  });

  it('describes the month’s payments, adelantos and what is left', () => {
    // 202 in April 2026: pays April and May.
    const paysAhead = line('2026-04', {
      paid: pesos(1400),
      advanced: fee,
      credit: fee,
    });
    expect(observations(paysAhead, m('2026-04'), fee)).toBe('PAGA ABRIL | ADELANTA MAYO');

    // 302 in April 2026: settles February and March, still owes April.
    const settles = line('2026-04', {
      currentFee: unpaidFee,
      paid: pesos(1400),
      covered: [covered('2026-02'), covered('2026-03')],
      owed: [owedFee('2026-04')],
    });
    expect(observations(settles, m('2026-04'), fee)).toBe('LIQUIDA FEBRERO Y MARZO | ADEUDA ABRIL');
    expect(currentFeeTone(settles)).toBe('owed');

    // 102 in July 2026: May, June and the penalty for not taking the shift.
    const catchesUp = line('2026-07', {
      paid: pesos(3100),
      covered: [
        covered('2026-05'),
        covered('2026-06'),
        covered('2026-06', true, 'SHIFT_SKIP_PENALTY', 1000),
        covered('2026-07'),
      ],
    });
    expect(observations(catchesUp, m('2026-07'), fee)).toBe(
      'LIQUIDA MAYO Y JUNIO | PAGA 1,000 POR NO LLEVAR ADMINISTRACIÓN | PAGA JULIO',
    );

    // A partial payment to an old month.
    const partial = line('2026-07', {
      currentFee: unpaidFee,
      paid: pesos(300),
      covered: [covered('2026-06', false, 'MAINTENANCE_FEE', 300)],
      owed: [owedFee('2026-06', 400), owedFee('2026-07')],
    });
    expect(observations(partial, m('2026-07'), fee)).toBe(
      "ABONA A JUNIO | ADEUDA 1,100 | 400 DE JUN '26 + 700 DE JUL '26",
    );
  });

  it('marks a month paid in advance, and leftovers that are not whole months', () => {
    // 401 in January 2025, after paying it in December 2024.
    const paidBefore = line('2025-01', {
      currentFee: {
        amount: fee,
        paidThisMonth: Money.ZERO,
        paidBefore: fee,
        paidBeforeIn: m('2024-12'),
        outstanding: Money.ZERO,
      },
      paid: Money.ZERO,
      covered: [],
    });
    expect(observations(paidBefore, m('2025-01'), fee)).toBe('PAGÓ EN DICIEMBRE 2024');
    expect(currentFeeTone(paidBefore)).toBe('paidBefore');

    const odd = line('2026-04', { paid: pesos(1000), advanced: pesos(300), credit: pesos(300) });
    expect(observations(odd, m('2026-04'), fee)).toBe('PAGA ABRIL | ADELANTA 300');

    // Two months ahead, after a month already paid ahead: June and July.
    const further = line('2026-04', {
      paid: pesos(2100),
      advanced: pesos(1400),
      credit: pesos(2100),
    });
    expect(observations(further, m('2026-04'), fee)).toBe('PAGA ABRIL | ADELANTA JUNIO Y JULIO');

    const leftOver = line('2026-05', { paid: Money.ZERO, covered: [], credit: pesos(700) });
    expect(observations(leftOver, m('2026-05'), fee)).toBe('SALDO A FAVOR 700');
    expect(observations(line('2026-05', { active: false }), m('2026-05'), fee)).toBe('INACTIVO');
    expect(observations(line('2026-05'), m('2026-05'), fee)).toBe('');
    expect(currentFeeTone(line('2026-05', { currentFee: null }))).toBe('plain');
  });

  it('prints what the administrator wrote on the payments, else the paper or the account', () => {
    // Nothing written: what the account says.
    const settles = line('2026-04', { active: false });
    expect(observationsCell(settles, m('2026-04'), fee)).toBe('INACTIVO');
    // Paid twice in the month: one line, its notes joined in the order they were paid.
    const twice = { ...settles, notes: ['ABONA 470', 'LIQUIDA OCTUBRE'] };
    expect(observationsCell(twice, m('2026-04'), fee)).toBe('ABONA 470 | LIQUIDA OCTUBRE');
    const fromPaper = {
      ...settles,
      paper: { current: fee, other: Money.ZERO, text: 'PAGÓ EN JULIO 2022' },
    };
    expect(observationsCell(fromPaper, m('2026-04'), fee)).toBe('PAGÓ EN JULIO 2022');
    expect(observationsCell({ ...fromPaper, notes: ['LIQUIDÓ'] }, m('2026-04'), fee)).toBe(
      'LIQUIDÓ',
    );
  });
});
