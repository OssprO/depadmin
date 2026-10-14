import type { AuditLogEntry, AuditLogPage } from '@depadmin/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectSession } from '@/lib/http';
import { fakeApi, owner501, sessionFor } from '@/test/fake-api';
import { renderApp } from '@/test/render-app';

const reset: AuditLogEntry = {
  id: '7',
  occurredAt: '2026-10-13T18:05:00.000Z',
  actor: { role: 'SUPERADMIN', unit: null },
  action: 'USER_PASSWORD_RESET',
  entity: 'user',
  entityId: 'u-502',
  entityLabel: '502',
  changes: [
    { field: 'password', redacted: true },
    { field: 'mustChangePassword', before: false, after: true },
  ],
};

const changed: AuditLogEntry = {
  ...reset,
  id: '8',
  occurredAt: '2026-10-14T16:40:00.000Z',
  actor: { role: 'OWNER', unit: 502 },
  action: 'USER_PASSWORD_CHANGED',
  changes: [
    { field: 'password', redacted: true },
    { field: 'mustChangePassword', before: true, after: false },
  ],
};

const page =
  (entries: AuditLogEntry[], nextCursor: string | null = null) =>
  () =>
    Response.json({ entries, nextCursor } satisfies AuditLogPage);

describe('AuditLogPage', () => {
  afterEach(() => {
    connectSession(null);
    vi.unstubAllGlobals();
  });

  it('lists the changes by day, newest first, without revealing passwords', async () => {
    fakeApi({
      'POST /api/auth/refresh': sessionFor(owner501),
      'GET /api/audit-log': page([changed, reset]),
    });
    renderApp('/audit');

    const days = await screen.findAllByRole('heading', { level: 2 });
    expect(days.map((d) => d.textContent)).toEqual([
      'miércoles, 14 de octubre de 2026',
      'martes, 13 de octubre de 2026',
    ]);
    const first = screen.getByText('Contraseña cambiada').closest('li')!;
    expect(within(first).getByText('Depto 502 · Usuario 502')).toBeInTheDocument();
    expect(within(first).getByText('10:40')).toBeInTheDocument();
    const second = screen.getByText('Contraseña temporal generada').closest('li')!;
    expect(within(second).getByText('Superadmin · Usuario 502')).toBeInTheDocument();
    expect(within(second).getByText('cambiada')).toBeInTheDocument();
    expect(within(second).getByText('No → Sí')).toBeInTheDocument();
  });

  it('loads older entries on demand', async () => {
    const api = fakeApi({
      'POST /api/auth/refresh': sessionFor(owner501),
      'GET /api/audit-log': ({ search }) =>
        search.get('before') === '8' ? page([reset])() : page([changed], '8')(),
    });
    renderApp('/audit');

    await userEvent.click(await screen.findByRole('button', { name: 'Ver más' }));

    expect(await screen.findByText('Contraseña temporal generada')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ver más' })).not.toBeInTheDocument();
    expect(api.callsTo('GET /api/audit-log').map((c) => c.search.get('before'))).toEqual([
      null,
      '8',
    ]);
  });

  it('filters by who acted, keeping the filter in the URL', async () => {
    const api = fakeApi({
      'POST /api/auth/refresh': sessionFor(owner501),
      'GET /api/audit-log': ({ search }) =>
        search.get('actor') === 'superadmin' ? page([reset])() : page([changed, reset])(),
    });
    const { router } = renderApp('/audit');
    await screen.findByText('Contraseña cambiada');

    await userEvent.selectOptions(screen.getByLabelText('Quién'), 'Superadmin');

    expect(await screen.findByText('Contraseña temporal generada')).toBeInTheDocument();
    expect(screen.queryByText('Contraseña cambiada')).not.toBeInTheDocument();
    expect(router.state.location.search).toEqual({ actor: 'superadmin' });
    expect(api.calls.at(-1)?.search.toString()).toBe('actor=superadmin');
  });

  it('starts from the filters in the URL and says when nothing matches', async () => {
    const api = fakeApi({
      'POST /api/auth/refresh': sessionFor(owner501),
      'GET /api/audit-log': page([]),
    });
    renderApp('/audit?entity=user&actor=501');

    expect(await screen.findByText('No hay cambios con estos filtros.')).toBeInTheDocument();
    expect(screen.getByLabelText('Qué')).toHaveValue('user');
    expect(screen.getByLabelText('Quién')).toHaveValue('501');
    expect(api.calls.at(-1)?.search.toString()).toBe('entity=user&actor=501');
  });
});
