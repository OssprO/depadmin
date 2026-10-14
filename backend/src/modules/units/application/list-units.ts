import { Inject, Injectable } from '@nestjs/common';
import { UnitNumber, type YearMonth } from '../../../shared-kernel/index.js';
import { UNIT_REPOSITORY, type Unit, type UnitRepository } from '../domain/index.js';

/** The ten deptos with their history of inactive periods, in ascending order. */
@Injectable()
export class ListUnits {
  constructor(@Inject(UNIT_REPOSITORY) private readonly units: UnitRepository) {}

  execute(): Promise<Unit[]> {
    return this.units.findAll();
  }
}

/**
 * Whether each depto is active in a month, answered from a loaded list. Other modules use it
 * through `ListUnits` instead of reading the units repository.
 */
export class UnitStatuses {
  private readonly byNumber: ReadonlyMap<UnitNumber, Unit>;

  constructor(units: readonly Unit[]) {
    this.byNumber = new Map(units.map((unit) => [unit.number, unit]));
  }

  isActive(unit: UnitNumber, month: YearMonth): boolean {
    return this.byNumber.get(unit)?.isActiveIn(month) ?? false;
  }

  activeIn(month: YearMonth): UnitNumber[] {
    return UnitNumber.all().filter((unit) => this.isActive(unit, month));
  }

  inactiveIn(month: YearMonth): UnitNumber[] {
    return UnitNumber.all().filter((unit) => !this.isActive(unit, month));
  }
}
