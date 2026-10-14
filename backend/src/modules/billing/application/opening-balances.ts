import { Inject, Injectable } from '@nestjs/common';
import {
  type Actor,
  AUDIT_TRAIL,
  type AuditSubject,
  type AuditTrail,
  Money,
  trackChanges,
  UNIT_OF_WORK,
  UnitNumber,
  type UnitOfWork,
  type YearMonth,
} from '../../../shared-kernel/index.js';
import {
  Charge,
  CHARGE_REPOSITORY,
  type ChargeRepository,
  type ChargeType,
  OPENING_CREDIT_REPOSITORY,
  OpeningBalance,
  type OpeningCreditRepository,
} from '../domain/index.js';

/** One debt carried into the books: a month (or what was left of it) or a penalty. */
export interface OpeningDebt {
  readonly month: YearMonth;
  readonly type: ChargeType;
  readonly amount: Money;
}

/**
 * A depto's opening balance in the audit log. Debts read like "2025-08 MAINTENANCE_FEE
 * 60000, 2026-07 SHIFT_SKIP_PENALTY 50000" (amounts in centavos).
 */
export const OPENING_BALANCE_AUDIT: AuditSubject<OpeningBalance> = {
  entity: 'opening_balance',
  id: (balance) => String(balance.unit.value),
  label: (balance) => String(balance.unit.value),
  snapshot: (balance) => ({
    debts:
      balance.charges
        .map((charge) => `${charge.month} ${charge.type} ${charge.amount.centavos}`)
        .join(', ') || null,
    credit: balance.credit.isZero() ? null : balance.credit.centavos,
  }),
};

export const OPENING_BALANCE_SET = 'OPENING_BALANCE_SET';

/** Every depto's opening balance for books that start in `start`. */
@Injectable()
export class ListOpeningBalances {
  constructor(
    @Inject(CHARGE_REPOSITORY) private readonly charges: ChargeRepository,
    @Inject(OPENING_CREDIT_REPOSITORY) private readonly credits: OpeningCreditRepository,
  ) {}

  async execute(start: YearMonth): Promise<OpeningBalance[]> {
    const [charges, credits] = await Promise.all([this.charges.findAll(), this.credits.findAll()]);
    return UnitNumber.all().map((unit) =>
      OpeningBalance.of(
        unit,
        start,
        charges.filter((charge) => charge.unit === unit && charge.month.isBefore(start)),
        credits.find((credit) => credit.unit === unit)?.amount ?? Money.ZERO,
      ),
    );
  }
}

/**
 * Replaces one depto's opening balance as a whole: the debts it carried from before the
 * books (charges dated before the start) and its adelanto. Called by the reports module,
 * which knows where the books start and whether they can still change. One audit entry per
 * change, with the before and after.
 */
@Injectable()
export class ReplaceOpeningBalance {
  constructor(
    @Inject(CHARGE_REPOSITORY) private readonly charges: ChargeRepository,
    @Inject(OPENING_CREDIT_REPOSITORY) private readonly credits: OpeningCreditRepository,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(AUDIT_TRAIL) private readonly audit: AuditTrail,
  ) {}

  async execute(
    actor: Actor,
    start: YearMonth,
    unit: UnitNumber,
    debts: readonly OpeningDebt[],
    credit: Money,
  ): Promise<OpeningBalance> {
    const next = OpeningBalance.of(
      unit,
      start,
      debts.map((debt) => Charge.create(unit, debt.month, debt.type, debt.amount)),
      credit,
    );
    return this.unitOfWork.run(async () => {
      const [unitCharges, credits] = await Promise.all([
        this.charges.findByUnit(unit),
        this.credits.findAll(),
      ]);
      const earlier = unitCharges.filter((charge) => charge.month.isBefore(start));
      const current = OpeningBalance.of(
        unit,
        start,
        earlier,
        credits.find((c) => c.unit === unit)?.amount ?? Money.ZERO,
      );
      const change = trackChanges(OPENING_BALANCE_AUDIT, current).change(OPENING_BALANCE_SET, next);
      if (change.changes.length === 0) return next;

      const kept = new Set(next.charges.map((charge) => charge.key));
      await this.charges.remove(earlier.filter((charge) => !kept.has(charge.key)));
      await this.charges.save(next.charges);
      await this.credits.save(unit, next.openingCredit);
      await this.audit.record(actor, change);
      return next;
    });
  }
}
