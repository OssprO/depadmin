import { Inject, Injectable } from '@nestjs/common';
import { type AuditActor, ListAuditLog } from '../../audit/application/index.js';
import type { AccountStatement, PaymentCoverage } from '../../billing/application/index.js';
import { type CashMovement, ReadCashbook } from '../../cashbook/application/index.js';
import {
  CLOCK,
  type Clock,
  ConflictError,
  type Instant,
  LocalDate,
  Money,
  NotFoundError,
  type UnitNumber,
  type YearMonth,
} from '../../../shared-kernel/index.js';
import { REPORT_REPOSITORY, type ReportRepository } from '../domain/index.js';
import { GetAccounts } from './accounts.js';
import { requireLedger } from './open-month.js';
import { REPORT_RENDERER, type ReportRenderer } from './report-document.js';

/** What a depto owes and has paid ahead at one moment. */
export interface Balance {
  readonly outstanding: Money;
  readonly credit: Money;
}

/**
 * A depto payment's receipt, as plain values for the renderer. It reads the account as it
 * stood right after the payment (the charges through its month, the payments up to it), so
 * it does not change as later months open; while its month is open a correction of the
 * book may still change it, and the receipt says so.
 */
export interface ReceiptDocument {
  readonly folio: number;
  readonly unit: UnitNumber;
  readonly date: LocalDate;
  readonly amount: Money;
  /**
   * The charges it paid, oldest first, as `allocatePayments` assigned them, each with the
   * charge's whole amount: a payment that finishes a charge already part paid covers less.
   */
  readonly covered: readonly (PaymentCoverage & { readonly charged: Money })[];
  /** What was left over, paid ahead (an adelanto). */
  readonly ahead: Money;
  /** The observations written on the payment. */
  readonly description: string | null;
  /** Who recorded it, from the audit log; null if the log does not say. */
  readonly recordedBy: AuditActor | null;
  readonly balanceAfter: Balance;
  readonly monthOpen: boolean;
  readonly generatedAt: Instant;
}

/** A depto's account statement, today or as it stood when a closed month ended. */
export interface StatementDocument {
  readonly unit: UnitNumber;
  /** The day it is drawn up to: today, or the last day of the closed month asked for. */
  readonly asOf: LocalDate;
  /** Null for today. */
  readonly through: YearMonth | null;
  readonly lines: AccountStatement['lines'];
  readonly payments: readonly {
    readonly date: LocalDate;
    readonly folio: number | null;
    readonly amount: Money;
  }[];
  readonly balance: Balance;
  readonly generatedAt: Instant;
}

const balanceOf = (statement: AccountStatement): Balance => ({
  outstanding: statement.outstandingBalance,
  credit: statement.creditBalance,
});

/** Receipts and statements, for everyone: every depto's account is open to all (spec 5). */
@Injectable()
export class RenderAccountDocuments {
  constructor(
    @Inject(REPORT_REPOSITORY) private readonly reports: ReportRepository,
    @Inject(REPORT_RENDERER) private readonly renderer: ReportRenderer,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly cashbook: ReadCashbook,
    private readonly accounts: GetAccounts,
    private readonly auditLog: ListAuditLog,
  ) {}

  async receipt(movementId: string): Promise<{ folio: number; pdf: Uint8Array }> {
    const document = await this.receiptOf(movementId);
    return { folio: document.folio, pdf: await this.renderer.renderReceipt(document) };
  }

  async statement(unit: UnitNumber, through?: YearMonth): Promise<Uint8Array> {
    return this.renderer.renderStatement(await this.statementOf(unit, through));
  }

  async receiptOf(movementId: string): Promise<ReceiptDocument> {
    const payment = await this.cashbook.movement(movementId);
    if (
      !payment ||
      payment.isRemoved ||
      payment.category !== 'UNIT_PAYMENT' ||
      payment.receiptNumber === null
    ) {
      throw new NotFoundError('RECEIPT_NOT_FOUND', `No live depto payment ${movementId}`);
    }
    const [ledger, statement, recordedBy] = await Promise.all([
      this.reports.loadLedger(),
      this.accounts.afterPayment(payment),
      this.recorderOf(payment),
    ]);
    const report = requireLedger(ledger).reports.find((r) => r.month.equals(payment.month));
    const charged = (c: PaymentCoverage) =>
      statement.lines.find(({ charge }) => charge.month.equals(c.month) && charge.type === c.type)
        ?.charge.amount ?? c.amount;
    const covered = statement.coverageOf(payment.id).map((c) => ({ ...c, charged: charged(c) }));
    return {
      folio: payment.receiptNumber,
      unit: payment.details.unit as UnitNumber,
      date: payment.date,
      amount: payment.amount,
      covered,
      ahead: payment.amount.minus(Money.sum(covered.map((c) => c.amount))),
      description: payment.details.description,
      recordedBy,
      balanceAfter: balanceOf(statement),
      monthOpen: report?.isOpen ?? true,
      generatedAt: this.clock.now(),
    };
  }

  async statementOf(unit: UnitNumber, through?: YearMonth): Promise<StatementDocument> {
    if (through) {
      const ledger = requireLedger(await this.reports.loadLedger());
      const report = ledger.reports.find((r) => r.month.equals(through));
      if (!report || report.isOpen) {
        throw new ConflictError('MONTH_NOT_CLOSED', `${through} is not closed`);
      }
    }
    const [statement, payments] = await Promise.all([
      through
        ? this.accounts.all(through).then((all) => all.find((s) => s.unit === unit)!)
        : this.accounts.of(unit),
      this.accounts.paymentsOf(unit, through),
    ]);
    return {
      unit,
      asOf: through ? LocalDate.lastOf(through) : this.clock.today(),
      through: through ?? null,
      lines: statement.lines,
      payments: payments.map((p) => ({ date: p.date, folio: p.receiptNumber, amount: p.amount })),
      balance: balanceOf(statement),
      generatedAt: this.clock.now(),
    };
  }

  /** Who added the row: its first entry in the audit log (a payment has a handful). */
  private async recorderOf(payment: CashMovement): Promise<AuditActor | null> {
    const { entries } = await this.auditLog.execute({
      entity: 'cash_movement',
      entityId: payment.id,
      limit: 100,
    });
    return entries.findLast((entry) => entry.action === 'CASH_MOVEMENT_ADDED')?.actor ?? null;
  }
}
