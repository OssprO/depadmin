// In-memory adapter for specs that touch charges. Excluded from the build.
import type { UnitNumber, YearMonth } from '../../../shared-kernel/index.js';
import type {
  Charge,
  ChargeRepository,
  OpeningCredit,
  OpeningCreditRepository,
} from '../domain/index.js';

export class InMemoryChargeRepository implements ChargeRepository {
  readonly rows = new Map<string, Charge>();

  findAll(): Promise<Charge[]> {
    return Promise.resolve([...this.rows.values()]);
  }

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

export class InMemoryOpeningCreditRepository implements OpeningCreditRepository {
  readonly rows = new Map<UnitNumber, OpeningCredit>();

  findAll(): Promise<OpeningCredit[]> {
    return Promise.resolve([...this.rows.values()]);
  }

  save(unit: UnitNumber, credit: OpeningCredit | null): Promise<void> {
    if (credit) this.rows.set(unit, credit);
    else this.rows.delete(unit);
    return Promise.resolve();
  }
}
