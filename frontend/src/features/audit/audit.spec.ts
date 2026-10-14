import type { AuditLogEntry } from '@depadmin/shared';
import { describe, expect, it } from 'vitest';
import { auditFiltersFrom, auditLogSearchParams, withFilter } from './filters';
import { describeEntry } from './labels';

const entry = (overrides: Partial<AuditLogEntry> = {}): AuditLogEntry => ({
  id: '1',
  occurredAt: '2026-10-13T18:00:00.000Z',
  actor: { role: 'SUPERADMIN', unit: null },
  action: 'USER_PASSWORD_RESET',
  entity: 'user',
  entityId: 'u-502',
  entityLabel: '502',
  changes: [
    { field: 'password', redacted: true },
    { field: 'mustChangePassword', before: false, after: true },
  ],
  ...overrides,
});

describe('describeEntry', () => {
  it('tells who did what to which record, in Spanish', () => {
    expect(describeEntry(entry())).toEqual({
      title: 'Contraseña temporal generada',
      actor: 'Superadmin',
      subject: 'Usuario 502',
      changes: [
        { field: 'Contraseña', text: 'cambiada' },
        { field: 'Debe cambiar la contraseña', text: 'No → Sí' },
      ],
    });
    expect(describeEntry(entry({ actor: { role: 'OWNER', unit: 501 } })).actor).toBe('Depto 501');
    expect(describeEntry(entry({ actor: { role: 'SYSTEM', unit: null } })).actor).toBe('Sistema');
  });

  it('describes a month closing with its frozen figures', () => {
    const text = describeEntry(
      entry({
        action: 'MONTH_CLOSED',
        entity: 'monthly_report',
        entityLabel: '2026-09',
        changes: [
          { field: 'status', before: 'OPEN', after: 'CLOSED' },
          { field: 'closingBalance', before: null, after: 640000 },
        ],
      }),
    );
    expect(text).toMatchObject({ title: 'Mes cerrado', subject: 'Mes 2026-09' });
    expect(text.changes).toEqual([
      { field: 'Estado', text: 'Abierto → Cerrado' },
      { field: 'Saldo final', text: '$6,400.00' },
    ]);
  });

  it('describes an opening balance in words', () => {
    const text = describeEntry(
      entry({
        action: 'OPENING_BALANCE_SET',
        entity: 'opening_balance',
        entityLabel: '301',
        changes: [
          {
            field: 'debts',
            before: null,
            after: '2025-08 MAINTENANCE_FEE 60000, 2026-07 SHIFT_SKIP_PENALTY 50000',
          },
          { field: 'credit', before: 70000, after: null },
        ],
      }),
    );
    expect(text).toMatchObject({ title: 'Carga inicial', subject: 'Saldo inicial del depto 301' });
    expect(text.changes).toEqual([
      { field: 'Adeudos', text: 'ago 2025 cuota $600.00; jul 2026 multa $500.00' },
      { field: 'Adelanto', text: '$700.00 → —' },
    ]);
  });

  it('shows codes it does not know as they are', () => {
    const text = describeEntry(
      entry({
        action: 'SOMETHING_NEW',
        entity: 'gadget',
        changes: [{ field: 'size', before: null, after: 3 }],
      }),
    );

    expect(text).toMatchObject({ title: 'SOMETHING_NEW', subject: 'gadget 502' });
    expect(text.changes).toEqual([{ field: 'size', text: '3' }]);
  });
});

describe('audit filters', () => {
  it('keeps only known filters from the URL', () => {
    expect(auditFiltersFrom({ entity: 'user', actor: 501 })).toEqual({
      entity: 'user',
      actor: 501,
    });
    expect(auditFiltersFrom({ actor: 'superadmin' })).toEqual({ actor: 'superadmin' });
    expect(auditFiltersFrom({ actor: 'system' })).toEqual({ actor: 'system' });
    expect(auditFiltersFrom({ entity: 'toString', actor: 999, other: 'x' })).toEqual({});
    expect(auditFiltersFrom({ actor: '501' })).toEqual({});
  });

  it('sets and clears one filter at a time', () => {
    const filters = withFilter({ entity: 'user' }, 'actor', 501);

    expect(filters).toEqual({ entity: 'user', actor: 501 });
    expect(withFilter(filters, 'entity', undefined)).toEqual({ actor: 501 });
  });

  it('builds the API query string', () => {
    expect(auditLogSearchParams({}).toString()).toBe('');
    expect(auditLogSearchParams({ entity: 'user', actor: 'superadmin' }, '42').toString()).toBe(
      'entity=user&actor=superadmin&before=42',
    );
  });
});
