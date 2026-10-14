import { describe, expect, it } from 'vitest';
import { Instant, LocalDate, Money, YearMonth } from '../../../../shared-kernel/index.js';
import { coverage, money, monthTitle, owed, shortDate, timestamp, week } from './format.js';

const m = (text: string) => YearMonth.parse(text);
const d = (text: string) => LocalDate.parse(text);
const part = (month: string, settles: boolean, type = 'MAINTENANCE_FEE' as const) => ({
  month: m(month),
  type,
  amount: Money.ofPesos(700),
  settles,
});

describe('PDF text', () => {
  it('writes money, months and dates in Spanish, with characters Helvetica can draw', () => {
    expect(money(Money.ofCentavos(140050))).toBe('$1,400.50');
    expect(monthTitle(m('2026-09'))).toBe('Septiembre 2026');
    expect(shortDate(d('2026-09-05'))).toBe('sáb 5 sep');
    expect(week(d('2026-10-05'))).toBe('5-11 oct');
    expect(week(d('2026-09-28'))).toBe('28 sep - 4 oct');
    // 18:00 UTC is midday in the building.
    expect(timestamp(Instant.ofEpochMillis(Date.parse('2026-10-03T18:05:00Z')))).toBe(
      '3 oct 2026, 12:05',
    );
  });

  it('says what payments covered and what is still owed', () => {
    expect(coverage([])).toBe('');
    expect(coverage([part('2026-08', true), part('2026-09', true)])).toBe('cubre ago y sep');
    expect(coverage([part('2026-08', true), part('2026-09', false)])).toBe(
      'cubre ago; abono a sep',
    );
    // Two payments towards the same charge show it once, as it ended.
    expect(coverage([part('2026-09', false), part('2026-09', true)])).toBe('cubre sep');
    expect(
      owed([
        { month: m('2026-08'), type: 'MAINTENANCE_FEE', amount: Money.ofPesos(700) },
        { month: m('2026-09'), type: 'MAINTENANCE_FEE', amount: Money.ofPesos(700) },
        { month: m('2026-09'), type: 'SHIFT_SKIP_PENALTY', amount: Money.ofPesos(500) },
      ]),
    ).toBe('ago, sep y multa sep');
  });
});
