import type { AuditSubject } from '../../../shared-kernel/index.js';
import type { ShiftDelegation } from '../domain/index.js';

export const DelegationAuditAction = {
  CREATED: 'SHIFT_DELEGATION_CREATED',
  CANCELLED: 'SHIFT_DELEGATION_CANCELLED',
} as const;

/** A delegation in the audit log, labelled e.g. "502 → 501" (its months are a field). */
export const DELEGATION_AUDIT: AuditSubject<ShiftDelegation> = {
  entity: 'shift_delegation',
  id: (delegation) => delegation.id,
  label: (d) => `${d.originalUnit} → ${d.delegateUnit}`,
  snapshot: (delegation) => ({
    months: String(delegation.months),
    originalUnit: delegation.originalUnit.value,
    delegateUnit: delegation.delegateUnit.value,
    reason: delegation.reason,
    active: delegation.isActive,
  }),
};
