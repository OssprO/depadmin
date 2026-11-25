import { screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectSession } from '@/lib/http';
import { historyOf, octoberReport } from '@/test/books';
import { fakeApi, owner501, sessionFor, superadmin, tenant302 } from '@/test/fake-api';
import { renderApp } from '@/test/render-app';
import { currentShift } from '@/test/shifts';

const SOME_ROW = '9c8b7a6f-5e4d-4c3b-8a2f-1e0d9c8b7a60';

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
    expect(within(tasks).getByRole('link')).toHaveTextContent('Confirmar 2 semanas de basura');
    expect(await screen.findByRole('region', { name: 'Deptos con adeudo' })).toHaveTextContent(
      'Todos al corriente.',
    );
  });

  describe('on Sunday 1 November, the day after October’s last payday', () => {
    const owner502 = {
      ...owner501,
      id: 'a1b2c3d4-0000-4000-8000-000000000502',
      username: '502',
      unit: 502,
    };
    // October's weeks are paid but the last one, paid on Saturday the 31st and asked for today.
    const october = (canWrite: boolean) =>
      octoberReport({
        canWrite,
        garbageWeeks: octoberReport().garbageWeeks.map((week) =>
          week.week === '2026-10-26'
            ? { ...week, status: 'PENDING', suggestedDate: '2026-10-31' }
            : { ...week, status: 'PAID', paidBy: { id: SOME_ROW, date: week.payday } },
        ),
      });
    const november = octoberReport({
      month: '2026-11',
      status: 'NOT_OPENED',
      balances: null,
      movements: [],
      canWrite: false,
      garbageWeeks: [],
    });

    beforeEach(() => vi.setSystemTime(new Date('2026-11-01T18:00:00Z')));

    it('asks whoever can still write October for its last week', async () => {
      fakeApi({
        'POST /api/auth/refresh': sessionFor(owner502),
        'GET /api/months': () => Response.json(historyOf()),
        'GET /api/months/2026-10': () => Response.json(october(true)),
        'GET /api/months/2026-11': () => Response.json(november),
        'GET /api/accounts': () => Response.json([]),
        'GET /api/shifts/current': () => Response.json(currentShift()),
      });
      renderApp('/');

      const tasks = await screen.findByRole('region', { name: 'Pendientes' });
      expect(
        within(tasks).getByRole('link', { name: 'Confirmar 1 semana de basura de octubre 2026' }),
      ).toHaveAttribute('href', '/book/2026-10');
    });

    it('does not ask whoever cannot write October', async () => {
      fakeApi({
        'POST /api/auth/refresh': sessionFor(tenant302),
        'GET /api/months': () => Response.json(historyOf()),
        'GET /api/months/2026-10': () => Response.json(october(false)),
        'GET /api/months/2026-11': () => Response.json(november),
        'GET /api/accounts': () => Response.json([]),
        'GET /api/shifts/current': () => Response.json(currentShift()),
      });
      renderApp('/');

      await screen.findByRole('region', { name: 'Deptos con adeudo' });
      expect(screen.queryByRole('region', { name: 'Pendientes' })).not.toBeInTheDocument();
    });

    it('leaves a closed October alone', async () => {
      const api = fakeApi({
        'POST /api/auth/refresh': sessionFor(owner502),
        'GET /api/months': () => Response.json(historyOf([{ status: 'CLOSED' }])),
        'GET /api/months/2026-10': () => Response.json(october(true)),
        'GET /api/months/2026-11': () => Response.json(november),
        'GET /api/accounts': () => Response.json([]),
        'GET /api/shifts/current': () => Response.json(currentShift()),
      });
      renderApp('/');

      await screen.findByRole('region', { name: 'Deptos con adeudo' });
      expect(screen.queryByRole('region', { name: 'Pendientes' })).not.toBeInTheDocument();
      expect(api.callsTo('GET /api/months/2026-10')).toHaveLength(0);
    });
  });
});
