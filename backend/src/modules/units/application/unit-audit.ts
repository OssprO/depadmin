import type { AuditSubject } from '../../../shared-kernel/index.js';
import type { Unit } from '../domain/index.js';

export const UnitAuditAction = {
  DEACTIVATED: 'UNIT_DEACTIVATED',
  REACTIVATED: 'UNIT_REACTIVATED',
} as const;

/** A depto in the audit log: its inactive periods, e.g. "2026-10..2026-12, 2027-05..". */
export const UNIT_AUDIT: AuditSubject<Unit> = {
  entity: 'unit',
  id: (unit) => String(unit.number.value),
  label: (unit) => String(unit.number.value),
  snapshot: (unit) => ({
    inactivePeriods: unit.inactivePeriods.map(String).join(', ') || null,
  }),
};
