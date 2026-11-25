/**
 * Port: runs work atomically. Every write use case runs inside one, together with its audit
 * entries, so either everything is saved or nothing is. Nested calls join the outer unit.
 * When the database aborts it to break a conflict with a concurrent one (a deadlock), the
 * work runs again from the start, so it must only read and write through the database.
 */
export interface UnitOfWork {
  run<T>(work: () => Promise<T>): Promise<T>;
  /**
   * Runs `effect` once the current unit of work commits, or right away outside one: for what
   * must not happen if the work is rolled back or retried, such as waking the email courier.
   * It must not throw, and nobody waits for it.
   */
  afterCommit(effect: () => void): void;
}

export const UNIT_OF_WORK = Symbol('UnitOfWork');
