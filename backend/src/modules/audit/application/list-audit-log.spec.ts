import { describe, expect, it } from 'vitest';
import { withCode } from '../../../../test/support/domain-error.js';
import { UnitNumber } from '../../../shared-kernel/index.js';
import type { AuditLogFilter, AuditLogPageRequest, AuditLogReader } from '../domain/index.js';
import { ListAuditLog } from './list-audit-log.js';

class SpyReader implements AuditLogReader {
  readonly calls: { filter: AuditLogFilter; page: AuditLogPageRequest }[] = [];

  page(filter: AuditLogFilter, page: AuditLogPageRequest) {
    this.calls.push({ filter, page });
    return Promise.resolve({ entries: [], nextCursor: null });
  }
}

describe('ListAuditLog', () => {
  const setup = () => {
    const reader = new SpyReader();
    return { reader, list: new ListAuditLog(reader) };
  };

  it('reads the first page with the default size', async () => {
    const { reader, list } = setup();

    await list.execute({});

    expect(reader.calls).toEqual([
      {
        filter: { entity: undefined, entityId: undefined, actor: undefined },
        page: { before: undefined, limit: 30 },
      },
    ]);
  });

  it('passes the filters, turning the actor into a role or a depto', async () => {
    const { reader, list } = setup();

    await list.execute({ entity: 'user', entityId: 'u-1', actor: 501, before: '42', limit: 10 });
    await list.execute({ actor: 'superadmin' });

    expect(reader.calls.map((c) => c.filter)).toEqual([
      { entity: 'user', entityId: 'u-1', actor: UnitNumber.of(501) },
      { entity: undefined, entityId: undefined, actor: 'SUPERADMIN' },
    ]);
    expect(reader.calls[0]?.page).toEqual({ before: '42', limit: 10 });
  });

  it('keeps the page size within bounds', async () => {
    const { reader, list } = setup();

    await list.execute({ limit: 1000 });
    await list.execute({ limit: 0 });

    expect(reader.calls.map((c) => c.page.limit)).toEqual([100, 1]);
  });

  it('rejects a depto that does not exist and a malformed cursor', () => {
    const { list } = setup();

    expect(() => list.execute({ actor: 999 })).toThrow(withCode('UNIT_NUMBER_INVALID'));
    for (const before of ['', '0', 'abc', '1e3', '9'.repeat(19)]) {
      expect(() => list.execute({ before })).toThrow(withCode('AUDIT_CURSOR_INVALID'));
    }
  });
});
