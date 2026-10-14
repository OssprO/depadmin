import type { OpeningBalances } from '@depadmin/shared';
import { UNIT_NUMBERS } from '@depadmin/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectSession } from '@/lib/http';
import { fakeApi, problem, sessionFor, superadmin } from '@/test/fake-api';
import { renderApp } from '@/test/render-app';

function opening(overrides: Partial<OpeningBalances> = {}): OpeningBalances {
  return {
    start: '2026-09',
    locked: false,
    balances: UNIT_NUMBERS.map((unit) => ({
      unit,
      debts: unit === 102 ? [{ month: '2026-08', type: 'MAINTENANCE_FEE', amount: 70000 }] : [],
      credit: unit === 202 ? 70000 : 0,
    })),
    ...overrides,
  };
}

describe('OpeningBalancesPage', () => {
  afterEach(() => {
    connectSession(null);
    vi.unstubAllGlobals();
  });

  it('records what a depto owed before the books, month by month, and its adelanto', async () => {
    const api = fakeApi({
      'POST /api/auth/refresh': sessionFor(superadmin),
      'GET /api/opening-balances': () => Response.json(opening()),
      'PUT /api/opening-balances/301': ({ body }) =>
        Response.json({ unit: 301, ...(body as object) }),
    });
    renderApp('/admin/opening');

    const row = (name: string) => screen.getByText(name).closest('li')!;
    expect(await screen.findByText('Depto 102')).toBeInTheDocument();
    expect(within(row('Depto 102')).getByText('debía $700.00')).toBeInTheDocument();
    expect(within(row('Depto 202')).getByText('adelanto $700.00')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Editar Depto 301' }));

    // What was left of one month, then three whole months at once.
    await userEvent.click(await screen.findByRole('button', { name: /Agregar un adeudo/ }));
    const month = screen.getByLabelText('Mes del adeudo 1');
    await userEvent.clear(month);
    await userEvent.type(month, '2025-08');
    await userEvent.type(screen.getByLabelText('Importe del adeudo 1 ($)'), '600');
    await userEvent.type(screen.getByLabelText('Desde'), '2025-09');
    const to = screen.getByLabelText('Hasta');
    await userEvent.clear(to);
    await userEvent.type(to, '2025-11');
    await userEvent.click(screen.getByRole('button', { name: /Agregar esos meses/ }));
    expect(screen.getByText('Total: $2,700.00')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Adelanto ($)'), '0');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await vi.waitFor(() => expect(api.callsTo('PUT /api/opening-balances/301')).toHaveLength(1));
    expect(api.callsTo('PUT /api/opening-balances/301')[0]?.body).toEqual({
      debts: [
        { month: '2025-08', type: 'MAINTENANCE_FEE', amount: 60000 },
        { month: '2025-09', type: 'MAINTENANCE_FEE', amount: 70000 },
        { month: '2025-10', type: 'MAINTENANCE_FEE', amount: 70000 },
        { month: '2025-11', type: 'MAINTENANCE_FEE', amount: 70000 },
      ],
      credit: 0,
    });
  });

  it('shows the balances as fixed once the first month is closed', async () => {
    fakeApi({
      'POST /api/auth/refresh': sessionFor(superadmin),
      'GET /api/opening-balances': () => Response.json(opening({ locked: true })),
    });
    renderApp('/admin/opening');

    expect(await screen.findByText(/ya se cerró, así que esto quedó fijo/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Editar/ })).not.toBeInTheDocument();
  });

  it('asks for the reporting start first', async () => {
    fakeApi({
      'POST /api/auth/refresh': sessionFor(superadmin),
      'GET /api/opening-balances': () => problem(409, 'REPORTING_NOT_STARTED'),
    });
    renderApp('/admin/opening');

    expect(await screen.findByRole('link', { name: 'Capturar el inicio' })).toHaveAttribute(
      'href',
      '/admin/start',
    );
  });

  it('is reached from the admin page', async () => {
    fakeApi({
      'POST /api/auth/refresh': sessionFor(superadmin),
      'GET /api/opening-balances': () => Response.json(opening()),
    });
    renderApp('/admin');

    await userEvent.click(await screen.findByRole('link', { name: /Carga inicial/ }));
    expect(await screen.findByRole('heading', { name: 'Carga inicial' })).toBeInTheDocument();
  });
});
