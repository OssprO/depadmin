import { describe, expect, it } from 'vitest';
import { auditLogQuerySchema, fieldChangeSchema } from './audit.js';

describe('audit contracts', () => {
  it('reads the filters from a query string', () => {
    expect(
      auditLogQuerySchema.parse({ entity: 'user', actor: '501', before: '42', limit: '10' }),
    ).toEqual({ entity: 'user', actor: 501, before: '42', limit: 10 });
    expect(auditLogQuerySchema.parse({ actor: 'superadmin' })).toEqual({ actor: 'superadmin' });
    expect(auditLogQuerySchema.parse({})).toEqual({});
  });

  it('rejects malformed filters', () => {
    for (const query of [
      { entity: 'User' },
      { actor: 'admin' },
      { actor: '5010' },
      { before: '0' },
      { before: 'abc' },
      { limit: '0' },
      { limit: '101' },
    ]) {
      expect(auditLogQuerySchema.safeParse(query).success, JSON.stringify(query)).toBe(false);
    }
  });

  it('tells a redacted change from a regular one', () => {
    expect(fieldChangeSchema.parse({ field: 'password', redacted: true })).toEqual({
      field: 'password',
      redacted: true,
    });
    expect(fieldChangeSchema.parse({ field: 'unit', before: null, after: 501 })).toEqual({
      field: 'unit',
      before: null,
      after: 501,
    });
    expect(fieldChangeSchema.safeParse({ field: 'x', before: 1 }).success).toBe(false);
  });
});
