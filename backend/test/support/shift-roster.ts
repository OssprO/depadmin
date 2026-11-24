import type { ShiftResponsibility, ShiftRoster } from '../../src/shared-kernel/index.js';

/** Who answers for each month, e.g. `{ '2026-11': [502] }`; months not listed have nobody. */
export class FakeShiftRoster implements ShiftRoster {
  constructor(private readonly table: Record<string, number[]> = {}) {}

  /** The table answers every month, whichever is asked for. */
  responsibilityFor(): Promise<ShiftResponsibility> {
    return Promise.resolve({
      isResponsible: (unit, month) => this.table[String(month)]?.includes(unit.value) ?? false,
    });
  }
}
