import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectSession } from '@/lib/http';
import { historyOf, octoberReport } from '@/test/books';
import { fakeApi, owner501, sessionFor } from '@/test/fake-api';
import { renderApp } from '@/test/render-app';

describe('HistoryPage', () => {
  afterEach(() => {
    connectSession(null);
    vi.unstubAllGlobals();
  });

  it('lists every month newest first, each with its balance, and opens its book', async () => {
    fakeApi({
      'POST /api/auth/refresh': sessionFor(owner501),
      'GET /api/months': () =>
        Response.json(historyOf([{ canClose: true }, {}, { historical: true }])),
      'GET /api/months/2026-09': () => Response.json(octoberReport({ month: '2026-09' })),
    });
    renderApp('/history');

    const rows = await screen.findAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual([
      'octubre 2026Por cerrar+ $1,400.00 · − $970.00$6,130.00saldo actual',
      'septiembre 2026Cerrado+ $1,400.00 · − $700.00$5,700.00saldo final',
      'agosto 2026CerradoHistorial+ $1,400.00 · − $900.00$5,000.00saldo final',
    ]);

    await userEvent.click(within(rows[1]!).getByRole('link'));
    expect(await screen.findByRole('heading', { name: 'septiembre 2026' })).toBeInTheDocument();
  });

  it('explains why there is nothing yet', async () => {
    fakeApi({
      'POST /api/auth/refresh': sessionFor(owner501),
      'GET /api/months': () => Response.json({ reportingStarted: false, months: [] }),
    });
    renderApp('/history');

    expect(
      await screen.findByText('Primero el superadmin captura el inicio de la contabilidad.'),
    ).toBeInTheDocument();
  });
});
