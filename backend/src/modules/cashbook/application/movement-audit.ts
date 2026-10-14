import type { AuditSubject } from '../../../shared-kernel/index.js';
import type { CashMovement } from '../domain/index.js';

export const MovementAuditAction = {
  ADDED: 'CASH_MOVEMENT_ADDED',
  REVISED: 'CASH_MOVEMENT_REVISED',
  REMOVED: 'CASH_MOVEMENT_REMOVED',
} as const;

/** A cashbook row in the audit log, labelled by its date (and depto, for a payment). */
export const MOVEMENT_AUDIT: AuditSubject<CashMovement> = {
  entity: 'cash_movement',
  id: (movement) => movement.id,
  label: ({ date, details }) => (details.unit ? `${date} · ${details.unit}` : String(date)),
  snapshot: ({ details }) => ({
    date: String(details.date),
    category: details.category,
    amount: details.amount.centavos,
    unit: details.unit?.value ?? null,
    description: details.description,
  }),
};
