import { Inject, Injectable } from '@nestjs/common';
import {
  type Actor,
  ConflictError,
  type Money,
  type UnitNumber,
  WriteAccessPolicy,
  type YearMonth,
} from '../../../shared-kernel/index.js';
import {
  ListOpeningBalances,
  type OpeningBalance,
  type OpeningDebt,
  ReplaceOpeningBalance,
} from '../../billing/application/index.js';
import { REPORT_REPOSITORY, type ReportLedger, type ReportRepository } from '../domain/index.js';
import { requireLedger } from './open-month.js';

export interface OpeningBalances {
  /** The first month of the books: the debts are from before it. */
  readonly start: YearMonth;
  /** Fixed once the first month is closed (reopen it to fix them). */
  readonly locked: boolean;
  readonly balances: readonly OpeningBalance[];
}

/** Once the first month is closed, what the deptos carried into the books is frozen with it. */
const isLocked = (ledger: ReportLedger) => ledger.reports[0]?.isOpen === false;

/** The initial load: what each depto owed and had paid ahead when the books started. */
@Injectable()
export class GetOpeningBalances {
  constructor(
    @Inject(REPORT_REPOSITORY) private readonly reports: ReportRepository,
    private readonly list: ListOpeningBalances,
  ) {}

  async execute(): Promise<OpeningBalances> {
    const ledger = requireLedger(await this.reports.loadLedger());
    return {
      start: ledger.start.month,
      locked: isLocked(ledger),
      balances: await this.list.execute(ledger.start.month),
    };
  }
}

/**
 * The superadmin records one depto's opening balance (initial load, PLAN question 7): its
 * debts from before the books, month by month (a partial month is what was left of it; a
 * skipped shift is a penalty), and the adelanto it had paid. It needs the reporting start,
 * and can change until the first month is closed.
 */
@Injectable()
export class SetOpeningBalance {
  private readonly policy = new WriteAccessPolicy();

  constructor(
    @Inject(REPORT_REPOSITORY) private readonly reports: ReportRepository,
    private readonly replace: ReplaceOpeningBalance,
  ) {}

  async execute(
    actor: Actor,
    unit: UnitNumber,
    debts: readonly OpeningDebt[],
    credit: Money,
  ): Promise<OpeningBalance> {
    this.policy.assertCanAdminister(actor);
    const ledger = requireLedger(await this.reports.loadLedger());
    if (isLocked(ledger)) {
      throw new ConflictError(
        'OPENING_BALANCE_LOCKED',
        `${ledger.start.month} is closed; reopen it to change the opening balances`,
      );
    }
    return this.replace.execute(actor, ledger.start.month, unit, debts, credit);
  }
}
