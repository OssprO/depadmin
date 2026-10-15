import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectSession } from '@/lib/http';
import { garbageRow, octoberReport, paymentRow } from '@/test/books';
import { fakeApi, owner501, problem, sessionFor, superadmin } from '@/test/fake-api';
import { renderApp } from '@/test/render-app';

const october =
  (report = octoberReport()) =>
  () =>
    Response.json(report);

// The week of 28 September is paid by `garbageRow`; the next two are pending.
const paidFirstWeek = (() => {
  const report = octoberReport({ movements: [paymentRow, garbageRow] });
  const [first, ...rest] = report.garbageWeeks;
  return {
    ...report,
    garbageWeeks: [
      { ...first!, status: 'PAID' as const, paidBy: { id: garbageRow.id, date: garbageRow.date } },
      ...rest,
    ],
  };
})();

const SHEET_ID = '3f6c1f3e-1d1a-4b7e-9a51-0e8b3c1d2a10';

/** May 2022, a month of the history, next to its paper. */
const mayPaper = (canEdit = true) => ({
  month: '2022-05',
  opening: 71225,
  income: 140000,
  expense: 27000,
  closing: 184225,
  paperOpening: 71225,
  paperClosing: 189225,
  paperIncome: 145000,
  paperExpense: 27000,
  ownGap: -5000,
  carriedGap: 0,
  canEdit,
  sheets: [
    {
      id: SHEET_ID,
      month: '2022-05',
      fromDay: 1,
      source: 'PDF MAY-JUL 2022 p1',
      opening: 71225,
      income: 145000,
      expense: 27000,
      closing: 189225,
      alerts: ['Cuota de $600 más $100 de administración'],
      lines: [
        { unit: 401, ownerName: 'NOMBRE', current: null, other: 70000, text: 'PAGÓ EN AGOSTO' },
      ],
    },
  ],
});

const mayReport = (overrides = {}) =>
  octoberReport({
    month: '2022-05',
    historical: true,
    accounts: [],
    garbageWeeks: [],
    cleaningPayouts: [],
    movements: [{ ...paymentRow, date: '2022-05-01', coverage: [] }],
    ...overrides,
  });

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

  it('shows a month of the history next to its paper, and its sheet can be corrected', async () => {
    const api = fakeApi({
      'POST /api/auth/refresh': sessionFor(superadmin),
      'GET /api/months/2022-05': () => Response.json(mayReport()),
      'GET /api/history/months/2022-05': () => Response.json(mayPaper()),
      [`PUT /api/history/sheets/${SHEET_ID}`]: () => new Response(null, { status: 204 }),
    });
    renderApp('/book/2022-05');

    expect(await screen.findByRole('heading', { name: 'Hoja de papel' })).toBeInTheDocument();
    expect(await screen.findByText('Faltan $50.00')).toBeInTheDocument();
    const income = screen.getByRole('row', { name: /^Ingresos/ });
    expect(within(income).getByText('+ $1,450.00')).toBeInTheDocument();
    expect(screen.getByText('Cuota de $600 más $100 de administración')).toBeInTheDocument();
    expect(
      screen.getByText('NOMBRE · adeudos/adelantos $700.00 · PAGÓ EN AGOSTO'),
    ).toBeInTheDocument();
    // The history keeps no accounts: a payment is not described as an adelanto.
    expect(screen.getByText('Pago Depto 401')).toBeInTheDocument();
    expect(screen.queryByText('adelanto')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Corregir' }));
    const current = await screen.findByLabelText('Mes en curso ($)', {
      selector: '#sheet-401-current',
    });
    await userEvent.type(current, '700');
    await userEvent.clear(screen.getByLabelText('Observaciones', { selector: '#sheet-401-text' }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await vi.waitFor(() =>
      expect(api.callsTo(`PUT /api/history/sheets/${SHEET_ID}`)).toHaveLength(1),
    );
    expect(api.callsTo(`PUT /api/history/sheets/${SHEET_ID}`)[0]?.body).toMatchObject({
      income: 145000,
      lines: [{ unit: 401, ownerName: 'NOMBRE', current: 70000, other: 70000, text: '' }],
    });
  });

  it('tells everyone else a month of the history is captured from its paper', async () => {
    fakeApi({
      'POST /api/auth/refresh': sessionFor(owner501),
      'GET /api/months/2022-05': () => Response.json(mayReport({ canWrite: false })),
      'GET /api/history/months/2022-05': () => Response.json(mayPaper(false)),
    });
    renderApp('/book/2022-05');

    expect(
      await screen.findByText('Solo lectura: el superadmin lo captura de su hoja de papel.'),
    ).toBeInTheDocument();
    expect(await screen.findByText('PDF MAY-JUL 2022 p1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Corregir' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Agregar hoja' })).not.toBeInTheDocument();
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
      week: null,
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

  it('suggests the pending garbage weeks and confirms one in a tap', async () => {
    const api = fakeApi({
      'POST /api/auth/refresh': sessionFor(superadmin),
      'GET /api/months/2026-10': october(paidFirstWeek),
      'POST /api/movements': () => Response.json({ id: garbageRow.id }, { status: 201 }),
    });
    renderApp('/book/2026-10');

    const pending = await screen.findByRole('region', { name: 'Basura por confirmar' });
    expect(within(pending).getAllByRole('listitem')).toHaveLength(2);
    expect(within(pending).getByText('$150.00 el 10 oct')).toBeInTheDocument();
    // A confirmed row says which week it paid.
    expect(screen.getByText('semana 28 sep – 4 oct')).toBeInTheDocument();

    await userEvent.click(
      within(pending).getByRole('button', { name: 'Confirmar semana 5–11 oct' }),
    );
    await vi.waitFor(() => expect(api.callsTo('POST /api/movements')).toHaveLength(1));
    expect(api.callsTo('POST /api/movements')[0]?.body).toEqual({
      date: '2026-10-10',
      category: 'GARBAGE',
      amount: 15000,
      unit: null,
      description: null,
      week: '2026-10-05',
    });
  });

  it('opens a pending week in the form to adjust the date before saving', async () => {
    const api = fakeApi({
      'POST /api/auth/refresh': sessionFor(superadmin),
      'GET /api/months/2026-10': october(),
      'POST /api/movements': () => Response.json({ id: garbageRow.id }, { status: 201 }),
    });
    renderApp('/book/2026-10');

    await userEvent.click(
      await screen.findByRole('button', { name: 'Semana 5–11 oct: ajustar antes de confirmar' }),
    );
    expect(await screen.findByRole('radio', { name: 'Basura' })).toBeChecked();
    expect(screen.getByLabelText('Semana que se paga')).toHaveValue('2026-10-05');
    expect(screen.getByLabelText('Fecha')).toHaveValue('2026-10-10');
    expect(screen.getByLabelText('Importe ($)')).toHaveValue('150');
    await userEvent.clear(screen.getByLabelText('Fecha'));
    await userEvent.type(screen.getByLabelText('Fecha'), '2026-10-12');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await vi.waitFor(() =>
      expect(api.callsTo('POST /api/movements')[0]?.body).toMatchObject({
        date: '2026-10-12',
        week: '2026-10-05',
      }),
    );
  });

  it('shows pending garbage without actions to whoever cannot write', async () => {
    fakeApi({
      'POST /api/auth/refresh': sessionFor(owner501),
      'GET /api/months/2026-10': october(octoberReport({ canWrite: false })),
    });
    renderApp('/book/2026-10');

    const pending = await screen.findByRole('region', { name: 'Basura por confirmar' });
    expect(within(pending).queryByRole('button')).not.toBeInTheDocument();
    const cleaning = screen.getByRole('region', { name: 'Limpieza por semana' });
    expect(within(cleaning).queryByRole('button')).not.toBeInTheDocument();
  });

  it('marks several cleaning visits on the month’s calendar', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-14T18:00:00Z'));
    const api = fakeApi({
      'POST /api/auth/refresh': sessionFor(superadmin),
      'GET /api/months/2026-10': october(),
      'POST /api/movements/cleaning-visits': () =>
        Response.json({ ids: [paymentRow.id, garbageRow.id] }, { status: 201 }),
    });
    renderApp('/book/2026-10');

    const cleaning = await screen.findByRole('region', { name: 'Limpieza por semana' });
    expect(within(cleaning).getByText('Semana 28 sep – 4 oct')).toBeInTheDocument();
    expect(within(cleaning).getByText('1 visita: 4 oct')).toBeInTheDocument();
    await userEvent.click(within(cleaning).getByRole('button', { name: /Marcar visitas/ }));

    expect(
      await screen.findByRole('button', { name: 'domingo, 4 de octubre, ya registrada' }),
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'jueves, 15 de octubre' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'lunes, 5 de octubre' }));
    await userEvent.click(screen.getByRole('button', { name: 'miércoles, 7 de octubre' }));
    await userEvent.click(screen.getByRole('button', { name: 'Registrar 2 visitas · $540.00' }));

    await vi.waitFor(() =>
      expect(api.callsTo('POST /api/movements/cleaning-visits')).toHaveLength(1),
    );
    expect(api.callsTo('POST /api/movements/cleaning-visits')[0]?.body).toEqual({
      dates: ['2026-10-05', '2026-10-07'],
      amount: 27000,
    });
    vi.useRealTimers();
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

describe('closing and reopening a month', () => {
  afterEach(() => {
    connectSession(null);
    vi.unstubAllGlobals();
  });

  // September is over: its outgoing owner closes it in the handover.
  const september = octoberReport({
    month: '2026-09',
    movements: [paymentRow],
    canClose: true,
    garbageWeeks: octoberReport().garbageWeeks.slice(0, 1),
  });

  it('warns about unpaid garbage weeks before closing, then closes', async () => {
    const api = fakeApi({
      'POST /api/auth/refresh': sessionFor(owner501),
      'GET /api/months/2026-09': () => Response.json(september),
      'POST /api/months/2026-09/close': () => new Response(null, { status: 204 }),
    });
    renderApp('/book/2026-09');

    const closing = await screen.findByRole('region', { name: 'Cierre del mes' });
    await userEvent.click(within(closing).getByRole('button', { name: 'Cerrar el mes' }));

    const dialog = await screen.findByRole('alertdialog', { name: '¿Cerrar septiembre 2026?' });
    expect(dialog).toHaveTextContent('Saldo final: $6,130.00');
    expect(dialog).toHaveTextContent(
      'Queda 1 semana de basura sin registrar: 28 sep – 4 oct. Si ya se pagaron, regístralas antes de cerrar.',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cerrar el mes' }));

    await vi.waitFor(() => expect(api.callsTo('POST /api/months/2026-09/close')).toHaveLength(1));
    await vi.waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });

  it('shows why closing failed and keeps the dialog open', async () => {
    fakeApi({
      'POST /api/auth/refresh': sessionFor(owner501),
      'GET /api/months/2026-09': () => Response.json(september),
      'POST /api/months/2026-09/close': () => problem(409, 'PREVIOUS_MONTH_OPEN'),
    });
    renderApp('/book/2026-09');

    await userEvent.click(await screen.findByRole('button', { name: 'Cerrar el mes' }));
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cerrar el mes' }));

    expect(
      await within(dialog).findByText('Los meses se cierran en orden: cierra primero el anterior.'),
    ).toBeInTheDocument();
  });

  it('lets the superadmin reopen a closed month', async () => {
    const api = fakeApi({
      'POST /api/auth/refresh': sessionFor(superadmin),
      'GET /api/months/2026-09': () =>
        Response.json({
          ...september,
          status: 'CLOSED',
          canWrite: false,
          canClose: false,
          canReopen: true,
        }),
      'POST /api/months/2026-09/reopen': () => new Response(null, { status: 204 }),
    });
    renderApp('/book/2026-09');

    await userEvent.click(await screen.findByRole('button', { name: 'Reabrir el mes' }));
    const dialog = await screen.findByRole('alertdialog', { name: '¿Reabrir septiembre 2026?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reabrir' }));

    await vi.waitFor(() => expect(api.callsTo('POST /api/months/2026-09/reopen')).toHaveLength(1));
  });

  it('tells everyone else that a closed month is frozen', async () => {
    fakeApi({
      'POST /api/auth/refresh': sessionFor(owner501),
      'GET /api/months/2026-09': () =>
        Response.json({ ...september, status: 'CLOSED', canWrite: false, canClose: false }),
    });
    renderApp('/book/2026-09');

    expect(await screen.findByText('Mes cerrado: la lista está congelada.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Cierre del mes' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reabrir el mes' })).not.toBeInTheDocument();
  });
});

describe('the month’s PDF', () => {
  const pdfBytes = () =>
    new Response('%PDF-1.3 report', { headers: { 'Content-Type': 'application/pdf' } });

  // jsdom has neither the Web Share API nor object URLs: each spec adds what it needs.
  const stub = (target: object, key: string, value: unknown) =>
    Object.defineProperty(target, key, { value, configurable: true, writable: true });

  afterEach(() => {
    connectSession(null);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    for (const key of ['share', 'canShare']) Reflect.deleteProperty(navigator, key);
    Reflect.deleteProperty(URL, 'createObjectURL');
  });

  it('downloads the report, marked as a draft while the month is open', async () => {
    const api = fakeApi({
      'POST /api/auth/refresh': sessionFor(owner501),
      'GET /api/months/2026-10': october(octoberReport({ canWrite: false })),
      'GET /api/months/2026-10/report.pdf': pdfBytes,
    });
    stub(URL, 'createObjectURL', () => 'blob:report');
    // Left in place: the download frees its URL a few seconds later, maybe after this spec.
    stub(URL, 'revokeObjectURL', () => undefined);
    const saved: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      saved.push(`${this.href} ${this.download}`);
    });
    renderApp('/book/2026-10');

    expect(
      await screen.findByText('El mes sigue abierto: el PDF sale como borrador.'),
    ).toBeInTheDocument();
    // Without the Web Share API (a desktop browser), downloading is the only way out.
    expect(screen.queryByRole('button', { name: 'Compartir' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Descargar PDF' }));

    await vi.waitFor(() => expect(saved).toEqual(['blob:report reporte-2026-10.pdf']));
    expect(api.callsTo('GET /api/months/2026-10/report.pdf')).toHaveLength(1);
  });

  it('shares the file where the phone can, straight to WhatsApp', async () => {
    fakeApi({
      'POST /api/auth/refresh': sessionFor(owner501),
      'GET /api/months/2026-10': october(octoberReport({ status: 'CLOSED', canWrite: false })),
      'GET /api/months/2026-10/report.pdf': pdfBytes,
    });
    const share = vi.fn<(data: ShareData) => Promise<void>>(() => Promise.resolve());
    stub(navigator, 'share', share);
    stub(navigator, 'canShare', () => true);
    renderApp('/book/2026-10');

    await userEvent.click(await screen.findByRole('button', { name: 'Compartir' }));

    await vi.waitFor(() => expect(share).toHaveBeenCalledOnce());
    const [data] = share.mock.calls[0]!;
    expect(data.title).toBe('Reporte de octubre 2026');
    expect(data.files?.map((file) => file.name)).toEqual(['reporte-2026-10.pdf']);
    expect(screen.queryByText(/borrador/)).not.toBeInTheDocument();
  });

  it('says why the PDF could not be prepared', async () => {
    fakeApi({
      'POST /api/auth/refresh': sessionFor(owner501),
      'GET /api/months/2026-10': october(),
      'GET /api/months/2026-10/report.pdf': () => problem(404, 'REPORT_NOT_FOUND'),
    });
    renderApp('/book/2026-10');

    await userEvent.click(await screen.findByRole('button', { name: 'Descargar PDF' }));

    expect(await screen.findByText('Ese mes no se ha abierto.')).toBeInTheDocument();
  });
});
