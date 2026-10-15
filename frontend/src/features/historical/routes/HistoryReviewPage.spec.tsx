import type { HistoryFile, HistoryMonthSummary, HistorySummary } from '@depadmin/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectSession } from '@/lib/http';
import { fakeApi, sessionFor, superadmin } from '@/test/fake-api';
import { renderApp } from '@/test/render-app';

const month = (
  value: string,
  overrides: Partial<HistoryMonthSummary> = {},
): HistoryMonthSummary => ({
  month: value,
  opening: 71225,
  income: 480000,
  expense: 185000,
  closing: 366225,
  paperOpening: 71225,
  paperClosing: 366225,
  ownGap: 0,
  carriedGap: 0,
  sheets: 1,
  movements: 20,
  alerts: 0,
  ...overrides,
});

const summary = (overrides: Partial<HistorySummary> = {}): HistorySummary => ({
  status: 'IN_REVIEW',
  firstMonth: '2022-05',
  lastMonth: '2022-07',
  openingBalance: 71225,
  closing: 682600,
  months: [
    month('2022-05', { alerts: 1 }),
    month('2022-06', { sheets: 0, paperOpening: null, paperClosing: null, ownGap: null }),
    month('2022-07', { ownGap: -5000 }),
  ],
  cutover: null,
  ...overrides,
});

const file: HistoryFile = {
  version: 1,
  openingBalance: 71225,
  months: [
    {
      month: '2022-05',
      sheets: [],
      movements: [
        {
          date: '2022-05-01',
          category: 'UNIT_PAYMENT',
          amount: 60000,
          unit: 101,
          description: null,
          week: null,
        },
      ],
    },
  ],
  owners: [{ unit: 101, name: 'NOMBRE' }],
};

const upload = (contents: string) =>
  userEvent.upload(
    screen.getByLabelText('Archivo'),
    new File([contents], 'historial.json', { type: 'application/json' }),
  );

describe('HistoryReviewPage', () => {
  afterEach(() => {
    connectSession(null);
    vi.unstubAllGlobals();
  });

  it('previews the file before importing it', async () => {
    let imported = false;
    const api = fakeApi({
      'POST /api/auth/refresh': sessionFor(superadmin),
      'GET /api/history': () => Response.json({ history: imported ? summary() : null }),
      'POST /api/history/preview': () => Response.json({ ...summary(), owners: file.owners }),
      'POST /api/history': () => {
        imported = true;
        return new Response(null, { status: 204 });
      },
    });
    renderApp('/admin/history');

    expect(await screen.findByText('Importar el historial')).toBeInTheDocument();
    await upload(JSON.stringify(file));

    expect(await screen.findByText('mayo 2022 a julio 2022 (3)')).toBeInTheDocument();
    expect(screen.getByText('junio 2022')).toBeInTheDocument();
    expect(api.callsTo('POST /api/history')).toHaveLength(0);

    await userEvent.click(screen.getByRole('button', { name: 'Importar' }));
    expect(await screen.findByText('En revisión')).toBeInTheDocument();
    expect(api.callsTo('POST /api/history')[0]?.body).toEqual(file);
  });

  it('says what is wrong with a file before sending it', async () => {
    const api = fakeApi({
      'POST /api/auth/refresh': sessionFor(superadmin),
      'GET /api/history': () => Response.json({ history: null }),
    });
    renderApp('/admin/history');
    await screen.findByText('Importar el historial');

    await upload('esto no es json');
    expect(await screen.findByText(/no es JSON/)).toBeInTheDocument();
    await upload(JSON.stringify({ ...file, version: 2 }));
    expect(
      await screen.findByText(/no tiene el formato esperado \(en version\)/),
    ).toBeInTheDocument();
    expect(api.callsTo('POST /api/history/preview')).toHaveLength(0);
  });

  it('lists the months with how each compares with its paper', async () => {
    fakeApi({
      'POST /api/auth/refresh': sessionFor(superadmin),
      'GET /api/history': () =>
        Response.json({
          history: summary({
            cutover: { month: '2022-08', openingBalance: 690000, difference: 7400 },
          }),
        }),
    });
    renderApp('/admin/history');

    const row = async (name: string) => (await screen.findByText(name)).closest('a')!;
    expect(within(await row('mayo')).getByText('Cuadra')).toBeInTheDocument();
    expect(within(await row('mayo')).getByText('1 alerta')).toBeInTheDocument();
    expect(within(await row('junio')).getByText('Sin hoja')).toBeInTheDocument();
    expect(within(await row('julio')).getByText('Faltan $50.00')).toBeInTheDocument();
    expect(screen.getByText(/\$74\.00 más que el cierre del historial/)).toBeInTheDocument();
    expect(screen.getByText('1 de 3')).toBeInTheDocument();
  });

  it('discards the history after confirming', async () => {
    let discarded = false;
    const api = fakeApi({
      'POST /api/auth/refresh': sessionFor(superadmin),
      'GET /api/history': () => Response.json({ history: discarded ? null : summary() }),
      'DELETE /api/history': () => {
        discarded = true;
        return new Response(null, { status: 204 });
      },
    });
    renderApp('/admin/history');

    await userEvent.click(await screen.findByRole('button', { name: 'Descartar el historial' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Sí, descartarlo' }));
    expect(await screen.findByText('Importar el historial')).toBeInTheDocument();
    expect(api.callsTo('DELETE /api/history')).toHaveLength(1);
  });
});
