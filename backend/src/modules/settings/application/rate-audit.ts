import type { AuditSubject } from '../../../shared-kernel/index.js';
import type { RateChange, RateName } from '../domain/index.js';

export const RateAuditAction = {
  SCHEDULED: 'RATE_CHANGE_SCHEDULED',
  WITHDRAWN: 'RATE_CHANGE_WITHDRAWN',
} as const;

/** One change of one rate. */
export interface RateChangeEntry extends RateChange {
  readonly rate: RateName;
}

/** A rate change in the audit log, labelled by the month it applies from, e.g. "2027-01". */
export const RATE_CHANGE_AUDIT: AuditSubject<RateChangeEntry> = {
  entity: 'rate_change',
  id: ({ rate, effectiveFrom }) => `${rate}:${effectiveFrom}`,
  label: ({ effectiveFrom }) => String(effectiveFrom.yearMonth),
  snapshot: ({ rate, effectiveFrom, amount, agreement }) => ({
    rate,
    effectiveFrom: String(effectiveFrom),
    amount: amount.centavos,
    agreedOn: agreement ? String(agreement.on) : null,
    agreement: agreement?.summary ?? null,
  }),
};
