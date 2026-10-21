import type { UnitNumber } from '../../../shared-kernel/index.js';
import type { Unit } from './unit.js';

export interface UnitRepository {
  findAll(): Promise<Unit[]>;
  findByNumber(number: UnitNumber): Promise<Unit | null>;
  save(unit: Unit): Promise<void>;
}

export const UNIT_REPOSITORY = Symbol('UnitRepository');
