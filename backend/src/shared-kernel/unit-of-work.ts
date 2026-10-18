/**
 * Port: runs work atomically. Every write use case runs inside one, together with its audit
 * entries, so either everything is saved or nothing is. Nested calls join the outer unit.
 * When the database aborts it to break a conflict with a concurrent one (a deadlock), the
 * work runs again from the start, so it must only read and write through the database.
 */
export interface UnitOfWork {
  run<T>(work: () => Promise<T>): Promise<T>;
}

export const UNIT_OF_WORK = Symbol('UnitOfWork');
