// In-memory adapter for specs that touch the cashbook. Excluded from the build.
import {
  type LocalDate,
  type UnitNumber,
  type YearMonth,
  YearMonthRange,
} from '../../../shared-kernel/index.js';
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

  findBetween(first: LocalDate, last: LocalDate): Promise<CashMovement[]> {
    return Promise.resolve(this.all().filter((m) => between(m.date, first, last)));
  }

  findGarbageForWeeks(first: LocalDate, last: LocalDate): Promise<CashMovement[]> {
    return Promise.resolve(
      this.all().filter(
        ({ details: { week }, isRemoved }) => week && !isRemoved && between(week, first, last),
      ),
    );
  }

  /** One request at a time in memory: nothing to wait for. */
  holdWeek(): Promise<void> {
    return Promise.resolve();
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

  insert(movements: readonly CashMovement[]): Promise<void> {
    return this.save(movements);
  }

  private all(): CashMovement[] {
    return [...this.rows.values()].map(copy);
  }

  private payments(): CashMovement[] {
    return this.all().filter((m) => m.category === 'UNIT_PAYMENT' && !m.isRemoved);
  }
}

const between = (date: LocalDate, first: LocalDate, last: LocalDate) =>
  !date.isBefore(first) && !date.isAfter(last);

/** Stored copies, so a use case that forgets to save is caught. */
const copy = (m: CashMovement) => CashMovement.restore(m.id, m.details, m.isRemoved);
