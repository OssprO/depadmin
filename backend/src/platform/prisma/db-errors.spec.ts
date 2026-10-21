import { describe, expect, it } from 'vitest';
import { isWriteConflict, translateViolations, violatedConstraint } from './db-errors.js';

/** The shape Prisma's driver adapter gives a Postgres constraint violation. */
const violation = (constraint: string) =>
  Object.assign(new Error('Database error'), {
    code: 'P2039',
    meta: {
      driverAdapterError: {
        cause: {
          originalCode: '23P01',
          originalMessage: `conflicting key value violates exclusion constraint "${constraint}"`,
        },
      },
    },
  });

describe('database errors', () => {
  it('names the violated constraint', () => {
    expect(violatedConstraint(violation('cash_movement_one_garbage_per_week'))).toBe(
      'cash_movement_one_garbage_per_week',
    );
    expect(violatedConstraint(new Error('boom'))).toBeNull();
    expect(violatedConstraint(undefined)).toBeNull();
  });

  it('turns a known violation into its domain error and lets anything else through', async () => {
    const translations = { known: () => new Error('translated') };
    await expect(
      translateViolations(() => Promise.reject(violation('known')), translations),
    ).rejects.toThrow('translated');
    await expect(
      translateViolations(() => Promise.reject(violation('other')), translations),
    ).rejects.toThrow('Database error');
    await expect(translateViolations(() => Promise.resolve(1), translations)).resolves.toBe(1);
  });

  it('tells a transaction aborted by a concurrent one from any other failure', () => {
    const aborted = (originalCode: string, code = 'P2010') =>
      Object.assign(new Error('Transaction failed'), {
        code,
        meta: { driverAdapterError: { cause: { originalCode } } },
      });
    expect(isWriteConflict(aborted('40P01', 'P2034'))).toBe(true);
    expect(isWriteConflict(aborted('40P01'))).toBe(true);
    expect(isWriteConflict(aborted('40001'))).toBe(true);
    expect(isWriteConflict(aborted('23P01'))).toBe(false);
    expect(isWriteConflict(violation('known'))).toBe(false);
    expect(isWriteConflict(new Error('boom'))).toBe(false);
    expect(isWriteConflict(undefined)).toBe(false);
  });
});
