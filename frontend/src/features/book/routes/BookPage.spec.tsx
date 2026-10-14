import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectSession } from '@/lib/http';
import { octoberReport, paymentRow } from '@/test/books';
import { fakeApi, owner501, sessionFor, superadmin } from '@/test/fake-api';
import { renderApp } from '@/test/render-app';

const october =
  (report = octoberReport()) =>
  () =>
    Response.json(report);

describe('BookPage', () => {
  afterEach(() => {
    connectSession(null);
    vi.unstubAllGlobals();
  });

  it('shows the summary and the rows by day, with what each payment covered', async () => {
    fakeApi({
      'POST /api/auth/refresh': sessionFor(superadmin),
      'GET /api/months/2026-10': october(),
    });
    renderApp('/book/2026-10');

    expect(await screen.findByRole('heading', { name: 'octubre 2026' })).toBeInTheDocument();
    expect((await screen.findByText('Saldo actual')).nextSibling).toHaveTextContent('$6,130.00');
    expect(screen.getByText('Abierto')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'sábado, 3 de octubre' })).toBeInTheDocument();
    const payment = screen.getByText('Pago Depto 401').closest('li')!;
    expect(within(payment).getByText('cubre sep y oct')).toBeInTheDocument();
    expect(within(payment).getByText('+ $1,400.00')).toBeInTheDocument();
    expect(
      within(screen.getByText('Limpieza').closest('li')!).getByText('− $270.00'),
    ).toBeInTheDocument();
  });

  it('is read-only for whoever cannot write the month', async () => {
    fakeApi({
      'POST /api/auth/refresh': sessionFor(owner501),
      'GET /api/months/2026-10': october(octoberReport({ canWrite: false })),
    });
    renderApp('/book/2026-10');

    expect(
      await screen.findByText('Solo lectura: lo anota el depto en turno.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Agregar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Pago Depto 401/ })).not.toBeInTheDocument();
  });

  it('records a payment, offering first the deptos that owe', async () => {
    const api = fakeApi({
      'POST /api/auth/refresh': sessionFor(superadmin),
      'GET /api/months/2026-10': october(),
      'POST /api/movements': () => Response.json({ id: paymentRow.id }, { status: 201 }),
    });
    renderApp('/book/2026-10');

    await userEvent.click(await screen.findByRole('button', { name: /Agregar/ }));
    const unit = await screen.findByLabelText('Depto');
    const options = within(unit)
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(options.slice(0, 3)).toEqual([
      'Selecciona',
      'Depto 102 · debe $1,400.00',
      'Depto 302 · debe $700.00',
    ]);
    expect(screen.getByLabelText('Importe ($)')).toHaveValue('700');
    await userEvent.selectOptions(unit, 'Depto 302 · debe $700.00');
    await userEvent.clear(screen.getByLabelText('Fecha'));
    await userEvent.type(screen.getByLabelText('Fecha'), '2026-10-05');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await vi.waitFor(() => expect(api.callsTo('POST /api/movements')).toHaveLength(1));
    expect(api.callsTo('POST /api/movements')[0]?.body).toEqual({
      date: '2026-10-05',
      category: 'UNIT_PAYMENT',
      amount: 70000,
      unit: 302,
      description: null,
    });
    await vi.waitFor(() => expect(screen.queryByLabelText('Depto')).not.toBeInTheDocument());
  });

  it('adapts the fields to the type and checks them before saving', async () => {
    const api = fakeApi({
      'POST /api/auth/refresh': sessionFor(superadmin),
      'GET /api/months/2026-10': october(),
      'POST /api/movements': () => Response.json({ id: paymentRow.id }, { status: 201 }),
    });
    renderApp('/book/2026-10');

    await userEvent.click(await screen.findByRole('button', { name: /Agregar/ }));
    await userEvent.click(await screen.findByRole('radio', { name: 'Limpieza' }));
    expect(screen.queryByLabelText('Depto')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Importe ($)')).toHaveValue('270');

    await userEvent.click(screen.getByRole('radio', { name: 'Otro egreso' }));
    await userEvent.type(screen.getByLabelText('Importe ($)'), '85.50');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar y agregar otro' }));
    expect(await screen.findByText('Describe el movimiento')).toBeInTheDocument();
    expect(api.callsTo('POST /api/movements')).toHaveLength(0);

    await userEvent.type(screen.getByLabelText('Descripción'), 'Foco del pasillo');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar y agregar otro' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Guardado: Otro egreso por $85.50.',
    );
    expect(api.callsTo('POST /api/movements')[0]?.body).toMatchObject({
      category: 'OTHER_EXPENSE',
      amount: 8550,
      description: 'Foco del pasillo',
    });
    // Ready for the next one, with the sheet still open.
    expect(screen.getByLabelText('Descripción')).toHaveValue('');
  });

  it('corrects and removes a row', async () => {
    const api = fakeApi({
      'POST /api/auth/refresh': sessionFor(superadmin),
      'GET /api/months/2026-10': october(),
      [`PUT /api/movements/${paymentRow.id}`]: () => new Response(null, { status: 204 }),
      [`DELETE /api/movements/${paymentRow.id}`]: () => new Response(null, { status: 204 }),
    });
    renderApp('/book/2026-10');

    await userEvent.click(await screen.findByRole('button', { name: /Pago Depto 401/ }));
    const amount = await screen.findByLabelText('Importe ($)');
    expect(amount).toHaveValue('1400');
    await userEvent.clear(amount);
    await userEvent.type(amount, '1050');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await vi.waitFor(() =>
      expect(api.callsTo(`PUT /api/movements/${paymentRow.id}`)[0]?.body).toMatchObject({
        amount: 105000,
        unit: 401,
      }),
    );

    await userEvent.click(await screen.findByRole('button', { name: /Pago Depto 401/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Borrar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Sí, borrar este movimiento' }));
    await vi.waitFor(() =>
      expect(api.callsTo(`DELETE /api/movements/${paymentRow.id}`)).toHaveLength(1),
    );
  });

  it('opens the month for whoever can', async () => {
    const api = fakeApi({
      'POST /api/auth/refresh': sessionFor(superadmin),
      'GET /api/months/2026-10': october(
        octoberReport({
          status: 'NOT_OPENED',
          balances: null,
          movements: [],
          canOpen: true,
          canWrite: false,
        }),
      ),
      'POST /api/months/2026-10/open': () => Response.json({ opened: ['2026-10'] }),
    });
    renderApp('/book/2026-10');

    await userEvent.click(await screen.findByRole('button', { name: 'Abrir el mes' }));

    await vi.waitFor(() => expect(api.callsTo('POST /api/months/2026-10/open')).toHaveLength(1));
  });

  it('asks the superadmin to set where the books start', async () => {
    fakeApi({
      'POST /api/auth/refresh': sessionFor(superadmin),
      'GET /api/months/2026-10': october(
        octoberReport({
          status: 'NOT_OPENED',
          reportingStarted: false,
          balances: null,
          movements: [],
        }),
      ),
    });
    renderApp('/book/2026-10');

    expect(await screen.findByText('La contabilidad aún no empieza')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Capturar el inicio' })).toHaveAttribute(
      'href',
      '/admin/start',
    );
  });

  it('treats an unknown month in the address as not found', async () => {
    fakeApi({ 'POST /api/auth/refresh': sessionFor(superadmin) });
    renderApp('/book/2026-13');

    expect(await screen.findByText(/no existe/i)).toBeInTheDocument();
  });
});
