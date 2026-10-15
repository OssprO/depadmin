import type { HistoricalMonth } from '@depadmin/shared';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectSession } from '@/lib/http';
import { fakeApi, sessionFor, superadmin } from '@/test/fake-api';
import { renderApp } from '@/test/render-app';

const SHEET_ID = '3f6c1f3e-1d1a-4b7e-9a51-0e8b3c1d2a10';
const ROW_ID = '9b2d4c1e-5f6a-4b3c-8d2e-1a0f9e8d7c60';

const april = (overrides: Partial<HistoricalMonth> = {}): HistoricalMonth => ({
  month: '2023-04',
  opening: 51450,
  income: 490000,
  expense: 692131,
  closing: -150681,
  paperOpening: 51450,
  paperClosing: -150681,
  ownGap: 0,
  carriedGap: 0,
  canEdit: true,
  previous: '2023-03',
  next: '2023-05',
  sheets: [
    {
      id: SHEET_ID,
      month: '2023-04',
      fromDay: 1,
      source: 'PDF ABR-JUL 2023 p1 / foto 45',
      opening: 51450,
      income: 490000,
      expense: 692131,
      closing: -150681,
      alerts: ['El mes cierra en negativo'],
      notes: [{ unit: 301, text: 'PENDIENTE ENERO Y ABRIL 2023' }],
    },
  ],
  movements: [
    {
      id: '5c1e2d3f-4a5b-4c6d-8e7f-9a0b1c2d3e40',
      date: '2023-04-01',
      category: 'UNIT_PAYMENT',
      amount: 70000,
      unit: 101,
      description: null,
      week: null,
      coverage: [],
    },
    {
      id: ROW_ID,
      date: '2023-04-20',
      category: 'OTHER_EXPENSE',
      amount: 95100,
      unit: null,
      description: 'PAGO LUZ CFE',
      week: null,
      coverage: [],
    },
  ],
  ...overrides,
});

describe('HistoricalMonthPage', () => {
  afterEach(() => {
    connectSession(null);
    vi.unstubAllGlobals();
  });

  it('shows the month next to its paper, with its remarks and observations', async () => {
    fakeApi({
      'POST /api/auth/refresh': sessionFor(superadmin),
      'GET /api/history/months/2023-04': () =>
        Response.json(april({ ownGap: -5000, carriedGap: 17800 })),
    });
    renderApp('/admin/history/2023-04');

    expect(await screen.findByText('Faltan $50.00')).toBeInTheDocument();
    expect(screen.getByText(/dan \$50\.00 menos de lo que movió la hoja/)).toBeInTheDocument();
    expect(screen.getByText(/Llega con \$178\.00 más/)).toBeInTheDocument();
    expect(screen.getAllByText('-$1,506.81').length).toBeGreaterThan(0);
    expect(screen.getByText('El mes cierra en negativo')).toBeInTheDocument();
    expect(screen.getByText('PENDIENTE ENERO Y ABRIL 2023')).toBeInTheDocument();
    expect(screen.getByText('PAGO LUZ CFE')).toBeInTheDocument();
    // The history keeps no accounts: a payment is not described as an adelanto.
    expect(screen.getByText('Pago Depto 101')).toBeInTheDocument();
    expect(screen.queryByText('adelanto')).not.toBeInTheDocument();
  });

  it('adds a row to the month', async () => {
    const api = fakeApi({
      'POST /api/auth/refresh': sessionFor(superadmin),
      'GET /api/history/months/2023-04': () => Response.json(april()),
      'POST /api/history/movements': () => Response.json({ id: ROW_ID }, { status: 201 }),
    });
    renderApp('/admin/history/2023-04');

    await userEvent.click(await screen.findByRole('button', { name: 'Agregar' }));
    await userEvent.click(screen.getByLabelText('Basura'));
    await userEvent.selectOptions(screen.getByLabelText('Semana que se paga'), '2023-04-03');
    const date = screen.getByLabelText('Fecha');
    await userEvent.clear(date);
    await userEvent.type(date, '2023-04-08');
    await userEvent.type(screen.getByLabelText('Importe ($)'), '150');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await vi.waitFor(() => expect(api.callsTo('POST /api/history/movements')).toHaveLength(1));
    expect(api.callsTo('POST /api/history/movements')[0]?.body).toEqual({
      date: '2023-04-08',
      category: 'GARBAGE',
      amount: 15000,
      unit: null,
      description: null,
      week: '2023-04-03',
    });
  });

  it('corrects a sheet, negative balances and blank figures included', async () => {
    const api = fakeApi({
      'POST /api/auth/refresh': sessionFor(superadmin),
      'GET /api/history/months/2023-04': () => Response.json(april()),
      [`PUT /api/history/sheets/${SHEET_ID}`]: () => new Response(null, { status: 204 }),
    });
    renderApp('/admin/history/2023-04');

    await userEvent.click(await screen.findByRole('button', { name: /Corregir/ }));
    await userEvent.clear(screen.getByLabelText('Egresos ($)'));
    const closing = screen.getByLabelText('Saldo final ($)');
    await userEvent.clear(closing);
    await userEvent.type(closing, '-1506.80');
    await userEvent.type(screen.getByLabelText('402'), 'PENDIENTE ABRIL 2023');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await vi.waitFor(() =>
      expect(api.callsTo(`PUT /api/history/sheets/${SHEET_ID}`)).toHaveLength(1),
    );
    expect(api.callsTo(`PUT /api/history/sheets/${SHEET_ID}`)[0]?.body).toEqual({
      fromDay: 1,
      source: 'PDF ABR-JUL 2023 p1 / foto 45',
      opening: 51450,
      income: 490000,
      expense: null,
      closing: -150680,
      alerts: ['El mes cierra en negativo'],
      notes: [
        { unit: 301, text: 'PENDIENTE ENERO Y ABRIL 2023' },
        { unit: 402, text: 'PENDIENTE ABRIL 2023' },
      ],
    });
  });

  it('is read-only once the history is verified', async () => {
    fakeApi({
      'POST /api/auth/refresh': sessionFor(superadmin),
      'GET /api/history/months/2023-04': () => Response.json(april({ canEdit: false })),
    });
    renderApp('/admin/history/2023-04');

    expect(await screen.findByText('PAGO LUZ CFE')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Agregar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Corregir/ })).not.toBeInTheDocument();
  });
});
