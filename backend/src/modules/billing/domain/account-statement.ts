import { Money, type UnitNumber, type YearMonth } from '../../../shared-kernel/index.js';
import { type Charge, type ChargeType, compareChargesForPayment } from './charge.js';
import {
  allocatePayments,
  type PaymentAllocation,
  type UnitPayment,
} from './payment-allocation.js';

export type ChargeStatus = 'PAID' | 'PARTIAL' | 'UNPAID';

export interface StatementLine {
  readonly charge: Charge;
  readonly paid: Money;
  readonly outstanding: Money;
  readonly status: ChargeStatus;
}

/** What one payment covered, for rows like "cubre sep y oct" or "abono parcial a ago". */
export interface PaymentCoverage {
  readonly month: YearMonth;
  readonly type: ChargeType;
  readonly amount: Money;
  /** Whether this payment finished paying the charge. */
  readonly settles: boolean;
}

/**
 * A depto's account: every charge with what has been paid towards it. Adeudo, adelanto and
 * partial payments are all derived here; none of them is ever stored.
 */
export class AccountStatement {
  private constructor(
    readonly unit: UnitNumber,
    readonly lines: readonly StatementLine[],
    /** Adeudo: what is still owed. */
    readonly outstandingBalance: Money,
    /** Adelanto: paid in advance, not yet applied to any charge. */
    readonly creditBalance: Money,
    private readonly allocations: readonly PaymentAllocation[],
    private readonly payments: ReadonlyMap<string, UnitPayment>,
  ) {}

  static build(
    unit: UnitNumber,
    charges: readonly Charge[],
    payments: readonly UnitPayment[],
  ): AccountStatement {
    const { allocations, unappliedCredit } = allocatePayments(unit, charges, payments);
    const lines = [...charges].sort(compareChargesForPayment).map((charge) => {
      const paid = Money.sum(
        allocations.filter((a) => a.chargeKey === charge.key).map((a) => a.amount),
      );
      const outstanding = charge.amount.minus(paid);
      const status: ChargeStatus = outstanding.isZero()
        ? 'PAID'
        : paid.isZero()
          ? 'UNPAID'
          : 'PARTIAL';
      return { charge, paid, outstanding, status };
    });
    const outstandingBalance = Money.sum(lines.map((line) => line.outstanding));
    return new AccountStatement(
      unit,
      lines,
      outstandingBalance,
      unappliedCredit,
      allocations,
      new Map(payments.map((payment) => [payment.id, payment])),
    );
  }

  /** The payments that went to a charge, and how much each gave, in payment order. */
  fundingOf(charge: Charge): { payment: UnitPayment; amount: Money }[] {
    return this.allocations
      .filter((allocation) => allocation.chargeKey === charge.key)
      .map((allocation) => ({
        // Every allocation comes from one of this statement's payments.
        payment: this.payments.get(allocation.paymentId) as UnitPayment,
        amount: allocation.amount,
      }));
  }

  get allocationsMade(): readonly PaymentAllocation[] {
    return this.allocations;
  }

  coverageOf(paymentId: string): PaymentCoverage[] {
    const linesByKey = new Map(this.lines.map((line) => [line.charge.key, line]));
    const allocations = this.allocations;
    return allocations.flatMap((allocation, index) => {
      if (allocation.paymentId !== paymentId) return [];
      // Every allocation points at one of this statement's charges.
      const line = linesByKey.get(allocation.chargeKey) as StatementLine;
      const isLastForCharge = !allocations
        .slice(index + 1)
        .some((later) => later.chargeKey === allocation.chargeKey);
      return [
        {
          month: line.charge.month,
          type: line.charge.type,
          amount: allocation.amount,
          settles: isLastForCharge && line.status === 'PAID',
        },
      ];
    });
  }
}
