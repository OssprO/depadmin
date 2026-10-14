import type { Unit } from '@depadmin/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectSession } from '@/lib/http';
import { fakeApi, sessionFor, superadmin } from '@/test/fake-api';
import { renderApp } from '@/test/render-app';

const units: Unit[] = [
  { number: 301, activeNow: true, inactivePeriods: [] },
  { number: 302, activeNow: false, inactivePeriods: [{ from: '2026-09', to: null }] },
];

describe('UnitsPage', () => {
  afterEach(() => {
    connectSession(null);
    vi.unstubAllGlobals();
  });

  it('marks a depto inactive from a month', async () => {
    const api = fakeApi({
      'POST /api/auth/refresh': sessionFor(superadmin),
      'GET /api/units': () => Response.json(units),
      'POST /api/units/301/status': () =>
        Response.json({
          number: 301,
          activeNow: true,
          inactivePeriods: [{ from: '2026-12', to: null }],
        }),
    });
    renderApp('/admin/units');

    const row = (await screen.findByText('Depto 301')).closest('li')!;
    expect(within(row).getByText('Activo')).toBeInTheDocument();
    await userEvent.click(within(row).getByRole('button', { name: 'Marcar inactivo' }));
    const month = await screen.findByLabelText('Desde');
    await userEvent.clear(month);
    await userEvent.type(month, '2026-12');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await vi.waitFor(() => expect(api.callsTo('POST /api/units/301/status')).toHaveLength(1));
    expect(api.callsTo('POST /api/units/301/status')[0]?.body).toEqual({
      active: false,
      from: '2026-12',
    });
  });

  it('offers to reactivate an inactive depto and shows since when', async () => {
    fakeApi({
      'POST /api/auth/refresh': sessionFor(superadmin),
      'GET /api/units': () => Response.json(units),
    });
    renderApp('/admin/units');

    const row = (await screen.findByText('Depto 302')).closest('li')!;
    expect(within(row).getByText('Inactivo desde septiembre 2026')).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: 'Reactivar' })).toBeInTheDocument();
  });

  it('is reached from the admin page', async () => {
    fakeApi({
      'POST /api/auth/refresh': sessionFor(superadmin),
      'GET /api/units': () => Response.json(units),
    });
    renderApp('/admin');

    await userEvent.click(await screen.findByRole('link', { name: /Deptos/ }));
    expect(await screen.findByRole('heading', { name: 'Deptos' })).toBeInTheDocument();
  });
});
