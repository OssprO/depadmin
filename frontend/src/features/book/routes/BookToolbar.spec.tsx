import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectSession } from '@/lib/http';
import { cleaningRow, garbageRow, octoberReport, paymentRow } from '@/test/books';
import { fakeApi, owner501, sessionFor } from '@/test/fake-api';
import { renderApp } from '@/test/render-app';

const water = {
  ...cleaningRow,
  id: '8a5f4e3d-2c1b-4a0f-9e8d-8c7b6a5f4e3d',
  date: '2026-10-09',
  category: 'OTHER_EXPENSE' as const,
  amount: 52000,
  description: 'Recibo del agua',
};
const october = octoberReport({ movements: [paymentRow, cleaningRow, garbageRow, water] });

/** The row titles in the order the screen lists them. */
const titles = () =>
  within(screen.getByRole('region', { name: 'Movimientos' }))
    .getAllByRole('listitem')
    .map((row) => row.querySelector('.font-medium')?.textContent);

function api() {
  return fakeApi({
    'POST /api/auth/refresh': sessionFor(owner501),
    'GET /api/months/2026-10': () => Response.json(october),
    'GET /api/months/2026-09': () =>
      Response.json(octoberReport({ month: '2026-09', status: 'CLOSED', movements: [] })),
  });
}

describe('the book’s rows: search, filters and order', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => {
    connectSession(null);
    vi.unstubAllGlobals();
  });

  it('says who administers the month, and its state', async () => {
    api();
    renderApp('/book/2026-10');

    const summary = (await screen.findByText('Resumen')).closest('[data-slot="card"]')!;
    expect(within(summary as HTMLElement).getByText('Administra Depto 502')).toBeInTheDocument();
    expect(within(summary as HTMLElement).getByText('Abierto')).toBeInTheDocument();
  });

  it('combines the filters from the address, and keeps them from month to month', async () => {
    api();
    const { router } = renderApp('/book/2026-10?tipo=OTHER_EXPENSE');

    expect(await screen.findByText('1 de 4 movimientos')).toBeInTheDocument();
    expect(titles()).toEqual(['Recibo del agua']);

    await userEvent.selectOptions(screen.getByLabelText('Filtrar por tipo'), 'Tipo: todos');
    await userEvent.selectOptions(screen.getByLabelText('Filtrar por depto'), 'Depto 401');
    expect(titles()).toEqual(['Pago Depto 401']);
    expect(router.state.location.search).toEqual({ depto: 401 });

    await userEvent.selectOptions(screen.getByLabelText('Filtrar por depto'), 'Depto: todos');
    await userEvent.type(screen.getByRole('searchbox'), 'AGUA');
    expect(titles()).toEqual(['Recibo del agua']);
    await userEvent.type(screen.getByRole('searchbox'), 'x');
    expect(screen.getByText('Ningún movimiento coincide.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('link', { name: 'Mes anterior' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/book/2026-09'));
    expect(router.state.location.search).toEqual({ q: 'AGUAx' });
  });

  it('clears every filter at once', async () => {
    api();
    renderApp('/book/2026-10?depto=401&q=nada');

    await userEvent.click(await screen.findByRole('button', { name: 'Quitar filtros' }));

    expect(await screen.findByText('4 movimientos')).toBeInTheDocument();
    expect(titles()).toHaveLength(4);
  });

  it('turns the rows around, newest first, and remembers it on this phone', async () => {
    api();
    const first = renderApp('/book/2026-10');
    await screen.findByText('4 movimientos');
    expect(titles()[0]).toBe('Pago Depto 401');

    await userEvent.click(screen.getByRole('button', { name: 'Más recientes primero' }));
    expect(titles()[0]).toBe('Recibo del agua');
    expect(screen.getByRole('button', { name: 'Más recientes primero' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    first.unmount();

    api();
    renderApp('/book/2026-10');
    await screen.findByText('4 movimientos');
    expect(titles()[0]).toBe('Recibo del agua');
  });
});
