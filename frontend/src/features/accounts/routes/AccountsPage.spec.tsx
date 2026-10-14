import { UNIT_NUMBERS } from '@depadmin/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectSession } from '@/lib/http';
import { fakeApi, owner501, sessionFor } from '@/test/fake-api';
import { renderApp } from '@/test/render-app';

describe('accounts', () => {
  afterEach(() => {
    connectSession(null);
    vi.unstubAllGlobals();
  });

  it('lists what each depto owes and opens its statement', async () => {
    fakeApi({
      'POST /api/auth/refresh': sessionFor(owner501),
      'GET /api/accounts': () =>
        Response.json(
          UNIT_NUMBERS.map((unit) => ({
            unit,
            outstanding: unit === 102 ? 105000 : 0,
            credit: unit === 501 ? 70000 : 0,
          })),
        ),
      'GET /api/accounts/102': () =>
        Response.json({
          unit: 102,
          outstanding: 105000,
          credit: 0,
          lines: [
            {
              month: '2026-09',
              type: 'MAINTENANCE_FEE',
              amount: 70000,
              paid: 35000,
              outstanding: 35000,
              status: 'PARTIAL',
            },
            {
              month: '2026-10',
              type: 'MAINTENANCE_FEE',
              amount: 70000,
              paid: 0,
              outstanding: 70000,
              status: 'UNPAID',
            },
          ],
        }),
    });
    renderApp('/more');

    await userEvent.click(await screen.findByRole('link', { name: /Estados de cuenta/ }));
    const own = (await screen.findByText('Depto 501 (tú)')).closest('a')!;
    expect(within(own).getByText('adelanto $700.00')).toBeInTheDocument();
    const owing = screen.getByText('Depto 102').closest('a')!;
    expect(within(owing).getByText('debe $1,050.00')).toBeInTheDocument();

    await userEvent.click(owing);
    expect(await screen.findByRole('heading', { name: 'Depto 102' })).toBeInTheDocument();
    // Newest first.
    expect(screen.getAllByRole('listitem')[0]).toHaveTextContent('octubre 2026');
    expect(screen.getByText('Falta $350.00')).toBeInTheDocument();
    expect(screen.getByText('Pendiente')).toBeInTheDocument();
  });
});
