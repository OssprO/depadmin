// In-memory adapter for specs that touch the cashbook. Excluded from the build.
import { YearMonthRange, type UnitNumber, type YearMonth } from '../../../shared-kernel/index.js';
import { CashMovement, type CashMovementRepository } from '../domain/index.js';

export class InMemoryCashMovementRepository implements CashMovementRepository {
  readonly rows = new Map<string, CashMovement>();

  findById(id: string): Promise<CashMovement | null> {
    const row = this.rows.get(id);
    return Promise.resolve(row ? copy(row) : null);
  }

  findByMonth(month: YearMonth): Promise<CashMovement[]> {
    const range = YearMonthRange.single(month);
    return Promise.resolve(this.all().filter((m) => range.contains(m.month)));
  }

  findPaymentsOf(unit: UnitNumber): Promise<CashMovement[]> {
    return Promise.resolve(this.payments().filter((m) => m.details.unit === unit));
  }

  findAllPayments(): Promise<CashMovement[]> {
    return Promise.resolve(this.payments());
  }

  save(movements: readonly CashMovement[]): Promise<void> {
    for (const movement of movements) this.rows.set(movement.id, copy(movement));
    return Promise.resolve();
  }

  private all(): CashMovement[] {
    return [...this.rows.values()].map(copy);
  }

  private payments(): CashMovement[] {
    return this.all().filter((m) => m.category === 'UNIT_PAYMENT' && !m.isRemoved);
  }
}

/** Stored copies, so a use case that forgets to save is caught. */
const copy = (m: CashMovement) => CashMovement.restore(m.id, m.details, m.isRemoved);
