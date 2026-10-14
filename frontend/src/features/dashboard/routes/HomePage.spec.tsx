import { screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectSession } from '@/lib/http';
import { historyOf, octoberReport } from '@/test/books';
import { fakeApi, owner501, sessionFor, superadmin } from '@/test/fake-api';
import { renderApp } from '@/test/render-app';
import { currentShift } from '@/test/shifts';

const owing = [
  { unit: 302, outstanding: 70000, credit: 0 },
  { unit: 102, outstanding: 140000, credit: 0 },
  { unit: 501, outstanding: 0, credit: 70000 },
];

describe('HomePage', () => {
  beforeEach(() => {
    // 2 November 2026: October is over, November has not been opened.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-02T18:00:00Z'));
  });
  afterEach(() => {
    connectSession(null);
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('lists what to do, the cash, and who owes, largest debt first', async () => {
    fakeApi({
      'POST /api/auth/refresh': sessionFor(owner501),
      'GET /api/months': () => Response.json(historyOf([{ canClose: true }])),
      'GET /api/months/2026-11': () =>
        Response.json(
          octoberReport({
            month: '2026-11',
            status: 'NOT_OPENED',
            balances: null,
            movements: [],
            canWrite: false,
          }),
        ),
      'GET /api/accounts': () => Response.json(owing),
      'GET /api/shifts/current': () => Response.json(currentShift()),
    });
    renderApp('/');

    const tasks = await screen.findByRole('region', { name: 'Pendientes' });
    expect(within(tasks).getByRole('link', { name: 'Cerrar octubre 2026' })).toHaveAttribute(
      'href',
      '/book/2026-10',
    );
    const cash = await screen.findByRole('region', { name: 'Caja' });
    expect(cash).toHaveTextContent('$6,130.00');
    expect(cash).toHaveTextContent('Saldo actual, con lo anotado hasta hoy.');
    expect(screen.getByText('noviembre 2026 no se ha abierto')).toBeInTheDocument();
    const debts = within(await screen.findByRole('region', { name: 'Deptos con adeudo' }))
      .getAllByRole('listitem')
      .map((row) => row.textContent);
    expect(debts).toEqual(['Depto 102debe $1,400.00', 'Depto 302debe $700.00']);
  });

  it('shows this month’s figures once it is open, and the garbage to confirm', async () => {
    fakeApi({
      'POST /api/auth/refresh': sessionFor(superadmin),
      'GET /api/months': () => Response.json(historyOf()),
      'GET /api/months/2026-11': () => Response.json(octoberReport({ month: '2026-11' })),
      'GET /api/accounts': () => Response.json(owing.slice(2)),
      'GET /api/shifts/current': () => Response.json(currentShift()),
    });
    renderApp('/');

    const cash = await screen.findByRole('region', { name: 'Caja' });
    expect(cash).toHaveTextContent('Ingresos de noviembre+ $1,400.00');
    expect(cash).toHaveTextContent('Egresos de noviembre− $270.00');
    const tasks = await screen.findByRole('region', { name: 'Pendientes' });
    expect(within(tasks).getByRole('link')).toHaveTextContent('Confirmar 3 semanas de basura');
    expect(await screen.findByRole('region', { name: 'Deptos con adeudo' })).toHaveTextContent(
      'Todos al corriente.',
    );
  });
});
