// In-memory adapters for the units use case specs (and the modules that read units).
// Excluded from the build.
import { UnitNumber, type YearMonthRange } from '../../../shared-kernel/index.js';
import { Unit, type UnitRepository } from '../domain/index.js';

export class InMemoryUnitRepository implements UnitRepository {
  private readonly rows = new Map<UnitNumber, Unit>();

  constructor(units: readonly Unit[] = []) {
    for (const unit of units) this.rows.set(unit.number, unit);
  }

  findAll(): Promise<Unit[]> {
    return Promise.resolve(
      [...this.rows.values()].sort((a, b) => a.number.value - b.number.value).map(copy),
    );
  }

  findByNumber(number: UnitNumber): Promise<Unit | null> {
    const unit = this.rows.get(number);
    return Promise.resolve(unit ? copy(unit) : null);
  }

  save(unit: Unit): Promise<void> {
    this.rows.set(unit.number, copy(unit));
    return Promise.resolve();
  }
}

/** Stored copies, so a use case that forgets to save is caught. */
const copy = (unit: Unit) => Unit.restore(unit.number, unit.inactivePeriods, unit.ownerName);

/** The ten deptos, each inactive during the range given for it (if any), with their owners. */
export function buildingWith(
  inactive: Record<number, YearMonthRange> = {},
  owners: Record<number, string> = {},
): InMemoryUnitRepository {
  return new InMemoryUnitRepository(
    UnitNumber.all().map((n) =>
      Unit.restore(n, inactive[n.value] ? [inactive[n.value]!] : [], owners[n.value] ?? null),
    ),
  );
}
