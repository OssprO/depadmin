import {
  type LocalDate,
  Money,
  type UnitNumber,
  ValidationError,
} from '../../../shared-kernel/index.js';
import { type Charge, compareChargesForPayment } from './charge.js';

/** A UNIT_PAYMENT row of the cashbook, as billing sees it. */
export interface UnitPayment {
  readonly id: string;
  readonly unit: UnitNumber;
  readonly date: LocalDate;
  readonly amount: Money;
}

/** The part of a payment that covers one charge. */
export interface PaymentAllocation {
  readonly paymentId: string;
  readonly chargeKey: string;
  readonly amount: Money;
}

export interface AllocationResult {
  readonly allocations: readonly PaymentAllocation[];
  /** Paid but not yet owed: covers future charges once they exist (adelanto). */
  readonly unappliedCredit: Money;
}

/**
 * Covers a depto's charges oldest-first with its payments in date order (FIFO). It is a pure
 * function of all the depto's charges and payments, so after any edit or removal the
 * allocations are recomputed from scratch instead of patched.
 */
export function allocatePayments(
  unit: UnitNumber,
  charges: readonly Charge[],
  payments: readonly UnitPayment[],
): AllocationResult {
  if (charges.some((c) => c.unit !== unit) || payments.some((p) => p.unit !== unit)) {
    throw new ValidationError(
      'ALLOCATION_MIXED_UNITS',
      `Allocation must only involve depto ${unit}`,
    );
  }

  const queue = [...charges]
    .sort(compareChargesForPayment)
    .map((charge) => ({ charge, due: charge.amount }));
  const ordered = [...payments].sort(
    (a, b) => a.date.compareTo(b.date) || a.id.localeCompare(b.id),
  );

  const allocations: PaymentAllocation[] = [];
  let unappliedCredit = Money.ZERO;
  let next = 0;
  for (const payment of ordered) {
    let left = payment.amount;
    while (left.isPositive() && next < queue.length) {
      const target = queue[next] as (typeof queue)[number];
      const amount = Money.min(left, target.due);
      allocations.push({ paymentId: payment.id, chargeKey: target.charge.key, amount });
      left = left.minus(amount);
      target.due = target.due.minus(amount);
      if (target.due.isZero()) next++;
    }
    unappliedCredit = unappliedCredit.plus(left);
  }
  return { allocations, unappliedCredit };
}
