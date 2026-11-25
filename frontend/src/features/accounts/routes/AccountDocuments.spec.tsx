import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorReporter } from '@/lib/error-reporter';
import { connectSession } from '@/lib/http';
import { drawPdfPages } from '@/lib/pdf-pages';
import { historyOf, octoberReport, paymentRow } from '@/test/books';
import { fakeApi, owner501, sessionFor } from '@/test/fake-api';
import { renderApp } from '@/test/render-app';

// jsdom cannot draw a PDF: pdf.js is replaced by pages that say which file they came from.
vi.mock('@/lib/pdf-pages', () => ({ drawPdfPages: vi.fn() }));

const PAYMENT = '5d2c1b0a-9f8e-4d7c-8b6a-5f4e3d2c1b0a';

const account401 = () =>
  Response.json({
    unit: 401,
    outstanding: 0,
    credit: 0,
    lines: [],
    payments: [{ id: PAYMENT, date: '2026-10-03', amount: 140000, receiptNumber: 42 }],
  });
const pdf = () => new Response('%PDF-1.3', { headers: { 'Content-Type': 'application/pdf' } });
const csv = () => new Response('﻿Fecha', { headers: { 'Content-Type': 'text/csv' } });

// jsdom has no object URLs: the download saves through a link, which the spec intercepts.
const stub = (target: object, key: string, value: unknown) =>
  Object.defineProperty(target, key, { value, configurable: true, writable: true });

let saved: string[];

describe('receipts, statements and the CSV export', () => {
  beforeEach(() => {
    stub(URL, 'createObjectURL', () => 'blob:file');
    stub(URL, 'revokeObjectURL', () => undefined);
    saved = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      saved.push(this.download);
    });
  });
  afterEach(() => {
    connectSession(null);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    Reflect.deleteProperty(URL, 'createObjectURL');
  });

  it('lists a depto’s payments with their folio, and downloads a receipt', async () => {
    const api = fakeApi({
      'POST /api/auth/refresh': sessionFor(owner501),
      'GET /api/accounts/401': account401,
      'GET /api/months': () => Response.json(historyOf()),
      [`GET /api/movements/${PAYMENT}/receipt.pdf`]: pdf,
    });
    renderApp('/accounts/401');

    const payments = (await screen.findByText('Pagos')).closest('[data-slot="card"]')!;
    expect(within(payments as HTMLElement).getByText('Folio 0042')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Recibo del folio 0042' }));

    await vi.waitFor(() => expect(saved).toEqual(['recibo-0042.pdf']));
    expect(api.callsTo(`GET /api/movements/${PAYMENT}/receipt.pdf`)).toHaveLength(1);
  });

  it('previews a receipt, then downloads that same file without asking the API again', async () => {
    vi.mocked(drawPdfPages).mockImplementation((data) => {
      expect(new TextDecoder().decode(data)).toBe('%PDF-1.3');
      return Promise.resolve([document.createElement('canvas'), document.createElement('canvas')]);
    });
    const api = fakeApi({
      'POST /api/auth/refresh': sessionFor(owner501),
      'GET /api/accounts/401': account401,
      'GET /api/months': () => Response.json(historyOf()),
      [`GET /api/movements/${PAYMENT}/receipt.pdf`]: pdf,
    });
    renderApp('/accounts/401');

    await userEvent.click(
      await screen.findByRole('button', { name: 'Vista previa del folio 0042' }),
    );

    const preview = await screen.findByRole('dialog', { name: 'Recibo folio 0042' });
    expect(await within(preview).findByRole('img', { name: 'Página 2 de 2' })).toBeVisible();
    expect(saved).toEqual([]);
    await userEvent.click(within(preview).getByRole('button', { name: 'Descargar PDF' }));

    await vi.waitFor(() => expect(saved).toEqual(['recibo-0042.pdf']));
    expect(api.callsTo(`GET /api/movements/${PAYMENT}/receipt.pdf`)).toHaveLength(1);
  });

  it('says so when a preview cannot be drawn, and reports why', async () => {
    const failure = new Error('Invalid PDF structure.');
    vi.mocked(drawPdfPages).mockRejectedValue(failure);
    const report = vi.spyOn(errorReporter, 'report').mockImplementation(() => undefined);
    fakeApi({
      'POST /api/auth/refresh': sessionFor(owner501),
      'GET /api/accounts/401': account401,
      'GET /api/months': () => Response.json(historyOf()),
      'GET /api/accounts/401/statement.pdf': pdf,
    });
    renderApp('/accounts/401');

    await userEvent.click(await screen.findByRole('button', { name: 'Vista previa' }));

    const preview = await screen.findByRole('dialog', { name: 'Estado de cuenta Depto 401' });
    expect(await within(preview).findByRole('alert')).toHaveTextContent(
      'No se pudo mostrar la vista previa aquí. Descárgalo para verlo.',
    );
    expect(report).toHaveBeenCalledWith('error', failure);
    expect(within(preview).getByRole('button', { name: 'Descargar PDF' })).toBeEnabled();
  });

  it('downloads the statement today, or as a closed month ended', async () => {
    const api = fakeApi({
      'POST /api/auth/refresh': sessionFor(owner501),
      'GET /api/accounts/401': account401,
      'GET /api/months': () => Response.json(historyOf()),
      'GET /api/accounts/401/statement.pdf': pdf,
    });
    renderApp('/accounts/401');

    const hasta = await screen.findByLabelText('Hasta');
    // Only the closed months are offered, after today (once the history has loaded).
    await vi.waitFor(() =>
      expect(
        within(hasta)
          .getAllByRole('option')
          .map((o) => o.textContent),
      ).toEqual(['El día de hoy', 'El cierre de septiembre 2026', 'El cierre de agosto 2026']),
    );
    await userEvent.selectOptions(hasta, 'El cierre de septiembre 2026');
    await userEvent.click(screen.getByRole('button', { name: 'Descargar PDF' }));

    await vi.waitFor(() => expect(saved).toEqual(['estado-de-cuenta-401-2026-09.pdf']));
    expect(api.callsTo('GET /api/accounts/401/statement.pdf')[0]?.search.get('through')).toBe(
      '2026-09',
    );
  });

  it('offers a recorded payment’s receipt from its form in the book', async () => {
    fakeApi({
      'POST /api/auth/refresh': sessionFor(owner501),
      'GET /api/months/2026-10': () => Response.json(octoberReport()),
    });
    renderApp('/book/2026-10');

    await userEvent.click(await screen.findByText('Pago Depto 401'));

    expect(
      await screen.findByRole('button', {
        name: `Recibo del folio 000${paymentRow.receiptNumber}`,
      }),
    ).toBeInTheDocument();
  });

  it('exports the months of the books as CSV from the history', async () => {
    const api = fakeApi({
      'POST /api/auth/refresh': sessionFor(owner501),
      'GET /api/months': () => Response.json(historyOf()),
      'GET /api/movements.csv': csv,
    });
    renderApp('/history');

    // Every month the books have, by default.
    expect(await screen.findByLabelText('Desde')).toHaveValue('2026-08');
    expect(screen.getByLabelText('Hasta')).toHaveValue('2026-10');
    // A spreadsheet is neither shared nor previewed.
    expect(screen.queryByRole('button', { name: 'Compartir' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Vista previa' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Descargar CSV' }));

    await vi.waitFor(() => expect(saved).toEqual(['movimientos-2026-08-a-2026-10.csv']));
    const [call] = api.callsTo('GET /api/movements.csv');
    expect([call?.search.get('from'), call?.search.get('to')]).toEqual(['2026-08', '2026-10']);
  });
});
