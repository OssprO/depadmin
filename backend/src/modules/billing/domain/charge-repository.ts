import type { UnitNumber, YearMonth } from '../../../shared-kernel/index.js';
import type { Charge } from './charge.js';

export interface ChargeRepository {
  findByUnit(unit: UnitNumber): Promise<Charge[]>;
  findByMonth(month: YearMonth): Promise<Charge[]>;
  /** Inserts new charges and updates the amount of existing ones (same key). */
  save(charges: readonly Charge[]): Promise<void>;
  /** E.g. the penalties of a cancelled delegation. */
  remove(charges: readonly Charge[]): Promise<void>;
}

export const CHARGE_REPOSITORY = Symbol('ChargeRepository');
