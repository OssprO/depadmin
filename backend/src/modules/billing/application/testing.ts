// In-memory adapter for specs that touch charges. Excluded from the build.
import type { UnitNumber, YearMonth } from '../../../shared-kernel/index.js';
import type { Charge, ChargeRepository } from '../domain/index.js';

export class InMemoryChargeRepository implements ChargeRepository {
  readonly rows = new Map<string, Charge>();

  findByUnit(unit: UnitNumber): Promise<Charge[]> {
    return Promise.resolve([...this.rows.values()].filter((c) => c.unit === unit));
  }

  findByMonth(month: YearMonth): Promise<Charge[]> {
    return Promise.resolve([...this.rows.values()].filter((c) => c.month.equals(month)));
  }

  save(charges: readonly Charge[]): Promise<void> {
    for (const charge of charges) this.rows.set(charge.key, charge);
    return Promise.resolve();
  }

  remove(charges: readonly Charge[]): Promise<void> {
    for (const charge of charges) this.rows.delete(charge.key);
    return Promise.resolve();
  }

  /** "unit:month:type amount" for each stored charge, sorted. */
  summary(): string[] {
    return [...this.rows.values()].map((c) => `${c.key} ${c.amount.centavos}`).sort();
  }
}
