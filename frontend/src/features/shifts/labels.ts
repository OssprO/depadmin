import type { DelegationReason, ShiftDelegation } from '@depadmin/shared';

export const REASONS: Record<DelegationReason, string> = {
  SKIPPED_SHIFT: 'No toma el turno (paga multa)',
  INACTIVE_UNIT: 'Depto inactivo',
  OTHER: 'Otro acuerdo',
};

/** e.g. "Depto 501 cubre a Depto 502 (no tomó el turno)". */
export function describeDelegation(delegation: ShiftDelegation): string {
  const why: Record<DelegationReason, string> = {
    SKIPPED_SHIFT: 'no tomó el turno',
    INACTIVE_UNIT: 'depto inactivo',
    OTHER: 'otro acuerdo',
  };
  return `Depto ${delegation.delegateUnit} cubre a Depto ${delegation.originalUnit} (${why[delegation.reason]})`;
}
