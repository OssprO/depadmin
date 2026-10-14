import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectSession } from '@/lib/http';
import { fakeApi, problem, sessionFor, superadmin } from '@/test/fake-api';
import { renderApp } from '@/test/render-app';

describe('ReportingStartPage', () => {
  afterEach(() => {
    connectSession(null);
    vi.unstubAllGlobals();
  });

  it('saves the first month and the cash on hand in centavos', async () => {
    const api = fakeApi({
      'POST /api/auth/refresh': sessionFor(superadmin),
      'GET /api/reporting-start': () => Response.json({ start: null }),
      'PUT /api/reporting-start': () => new Response(null, { status: 204 }),
    });
    renderApp('/admin/start');

    await userEvent.type(await screen.findByLabelText('Primer mes'), '2026-08');
    await userEvent.type(screen.getByLabelText('Efectivo en caja al empezar ($)'), '5230.50');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Guardado.');
    expect(api.callsTo('PUT /api/reporting-start')[0]?.body).toEqual({
      month: '2026-08',
      openingBalance: 523050,
    });
  });

  it('explains why it can no longer change', async () => {
    fakeApi({
      'POST /api/auth/refresh': sessionFor(superadmin),
      'GET /api/reporting-start': () =>
        Response.json({ start: { month: '2026-08', openingBalance: 500000 } }),
      'PUT /api/reporting-start': () => problem(409, 'REPORTING_START_LOCKED'),
    });
    renderApp('/admin/start');

    expect(await screen.findByLabelText('Efectivo en caja al empezar ($)')).toHaveValue('5000');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText(/ya no se puede cambiar/)).toBeInTheDocument();
  });
});
