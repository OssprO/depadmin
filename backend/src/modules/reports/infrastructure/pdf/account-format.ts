import type { LocalDate, Money } from '../../../../shared-kernel/index.js';
import type { AuditActor } from '../../../audit/application/index.js';
import type {
  ChargeStatus,
  ChargeType,
  PaymentCoverage,
} from '../../../billing/application/index.js';
import type { Balance } from '../../application/index.js';
import { money, monthName, monthTitle } from './format.js';

// The text of a payment's receipt and of a depto's account statement, in the report's
// style: uppercase, and only characters the standard PDF fonts draw (WinAnsi).

/** "FOLIO 0042". */
export const folioText = (folio: number): string => `FOLIO ${String(folio).padStart(4, '0')}`;

/** "3 DE OCTUBRE DE 2026". */
export const longDate = (date: LocalDate): string =>
  `${date.day} DE ${monthName(date.yearMonth)} DE ${date.year}`;

/** "CUOTA OCTUBRE 2026", "MULTA NOVIEMBRE 2026". */
export const chargeText = (type: ChargeType, month: LocalDate['yearMonth']): string =>
  `${type === 'SHIFT_SKIP_PENALTY' ? 'MULTA POR NO TOMAR EL TURNO' : 'CUOTA'} ${monthTitle(month)}`;

/** One charge a payment covered; "ABONO A …" when it left part of it owed. */
/**
 * One charge a payment covered: «ABONO A …» when it left part of it owed, «LIQUIDA …» when
 * it paid what an earlier payment had left of it, else just the charge.
 */
export function coverageText(
  { type, month, settles, amount }: PaymentCoverage,
  charged: Money = amount,
): string {
  if (!settles) return `ABONO A ${chargeText(type, month)}`;
  return charged.isGreaterThan(amount)
    ? `LIQUIDA ${chargeText(type, month)}`
    : chargeText(type, month);
}

/** "AL CORRIENTE", "ADEUDA $700.00", "ADELANTO $1,400.00" (or both). */
export function balanceText({ outstanding, credit }: Balance): string {
  const parts = [
    outstanding.isPositive() && `ADEUDA ${money(outstanding)}`,
    credit.isPositive() && `ADELANTO ${money(credit)}`,
  ].filter(Boolean);
  return parts.length === 0 ? 'AL CORRIENTE' : parts.join(' Y ');
}

/** Who recorded a payment, as the audit log says: "DEPTO 502", "SUPERADMIN". */
export function recorderText(actor: AuditActor | null): string | null {
  if (!actor) return null;
  switch (actor.role) {
    case 'SUPERADMIN':
      return 'SUPERADMIN';
    case 'SYSTEM':
      return 'LA APP';
    case 'OWNER':
      return `DEPTO ${actor.unit.value}`;
    case 'READER':
      return actor.unit ? `SOLO LECTURA (DEPTO ${actor.unit.value})` : 'SOLO LECTURA';
  }
}

export const STATUS_TEXT: Record<ChargeStatus, string> = {
  PAID: 'PAGADO',
  PARTIAL: 'ABONADO',
  UNPAID: 'PENDIENTE',
};
