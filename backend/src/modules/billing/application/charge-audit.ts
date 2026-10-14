import type { AuditSubject } from '../../../shared-kernel/index.js';
import type { Charge } from '../domain/index.js';

export const ChargeAuditAction = {
  ADDED: 'CHARGE_ADDED',
  REMOVED: 'CHARGE_REMOVED',
} as const;

/** A charge in the audit log; the amount is in centavos. */
export const CHARGE_AUDIT: AuditSubject<Charge> = {
  entity: 'charge',
  id: (charge) => charge.key,
  label: (charge) => `${charge.unit} · ${charge.month}`,
  snapshot: (charge) => ({
    unit: charge.unit.value,
    month: String(charge.month),
    type: charge.type,
    amount: charge.amount.centavos,
  }),
};
