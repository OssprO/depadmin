import type { YearMonth } from '../../../shared-kernel/index.js';
import type { ShiftDelegation } from './shift-delegation.js';

export interface ShiftDelegationRepository {
  findById(id: string): Promise<ShiftDelegation | null>;
  /** Delegations (cancelled ones included) touching any month from `from` to `to`. */
  findOverlapping(from: YearMonth, to: YearMonth): Promise<ShiftDelegation[]>;
  save(delegation: ShiftDelegation): Promise<void>;
}

export const SHIFT_DELEGATION_REPOSITORY = Symbol('ShiftDelegationRepository');
