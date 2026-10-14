import { describe, expect, it } from 'vitest';
import {
  type AuditSubject,
  creationOf,
  diffSnapshots,
  Redacted,
  trackChanges,
} from './audit-trail.js';

interface Account {
  id: string;
  name: string;
  active: boolean;
  secret: string | null;
}

const ACCOUNT: AuditSubject<Account> = {
  entity: 'account',
  id: (a) => a.id,
  label: (a) => a.name,
  snapshot: (a) => ({ name: a.name, active: a.active, secret: new Redacted(a.secret) }),
};

describe('diffSnapshots', () => {
  it('lists only the fields that changed, with their old and new values', () => {
    expect(diffSnapshots({ a: 1, b: 'x', c: true }, { a: 2, b: 'x', c: null })).toEqual([
      { field: 'a', before: 1, after: 2 },
      { field: 'c', before: true, after: null },
    ]);
  });

  it('describes a creation and a removal against nothing', () => {
    expect(diffSnapshots(null, { a: 1, b: null })).toEqual([
      { field: 'a', before: null, after: 1 },
    ]);
    expect(diffSnapshots({ a: 1 }, null)).toEqual([{ field: 'a', before: 1, after: null }]);
  });

  it('includes fields present on only one side', () => {
    expect(diffSnapshots({ old: 'x' }, { new: 'y' })).toEqual([
      { field: 'new', before: null, after: 'y' },
      { field: 'old', before: 'x', after: null },
    ]);
  });

  it('records that a redacted field changed, never its values', () => {
    const changes = diffSnapshots(
      { password: new Redacted('hash-1') },
      { password: new Redacted('hash-2') },
    );

    expect(changes).toEqual([{ field: 'password', redacted: true }]);
    expect(JSON.stringify(changes)).not.toContain('hash');
    expect(
      diffSnapshots({ password: new Redacted('same') }, { password: new Redacted('same') }),
    ).toEqual([]);
    expect(diffSnapshots(null, { password: new Redacted(null) })).toEqual([]);
  });
});

describe('trackChanges', () => {
  it('describes what a mutation changed, labelled as the entity is now', () => {
    const account: Account = { id: 'a-1', name: 'Old', active: true, secret: 's1' };
    const tracked = trackChanges(ACCOUNT, account);

    account.name = 'New';
    account.secret = 's2';

    expect(tracked.change('ACCOUNT_RENAMED')).toEqual({
      action: 'ACCOUNT_RENAMED',
      entity: 'account',
      entityId: 'a-1',
      entityLabel: 'New',
      changes: [
        { field: 'name', before: 'Old', after: 'New' },
        { field: 'secret', redacted: true },
      ],
    });
  });

  it('compares against a new instance for immutable entities', () => {
    const before: Account = { id: 'a-1', name: 'A', active: true, secret: null };
    const after: Account = { ...before, active: false };

    expect(trackChanges(ACCOUNT, before).change('ACCOUNT_DISABLED', after).changes).toEqual([
      { field: 'active', before: true, after: false },
    ]);
  });
});

describe('creationOf', () => {
  it('lists every field from nothing', () => {
    const account: Account = { id: 'a-1', name: 'A', active: true, secret: 'x' };

    expect(creationOf(ACCOUNT, 'ACCOUNT_CREATED', account).changes).toEqual([
      { field: 'name', before: null, after: 'A' },
      { field: 'active', before: null, after: true },
      { field: 'secret', redacted: true },
    ]);
  });
});
