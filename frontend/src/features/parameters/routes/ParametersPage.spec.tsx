import type { RatesResponse } from '@depadmin/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectSession } from '@/lib/http';
import { fakeApi, owner501, problem, sessionFor, superadmin } from '@/test/fake-api';
import { renderApp } from '@/test/render-app';

type History = RatesResponse['rates'][number]['history'];

const unchanged = (amount: number): History => [
  { effectiveFrom: '2026-08-01', amount, agreement: null, upcoming: false, withdrawable: false },
];

function rates(canChange: boolean, feeHistory = unchanged(70000)): RatesResponse {
  return {
    canChange,
    rates: [
      { rate: 'maintenanceFee', current: 70000, history: feeHistory, earliestMonth: '2026-12' },
      {
        rate: 'cleaningPerVisit',
        current: 27000,
        history: unchanged(27000),
        earliestMonth: '2026-12',
      },
      {
        rate: 'garbageWeekly',
        current: 15000,
        history: unchanged(15000),
        earliestMonth: '2026-12',
      },
      {
        rate: 'shiftSkipPenalty',
        current: 50000,
        history: unchanged(50000),
        earliestMonth: '2026-12',
      },
    ],
  };
}

const AGREEMENT = 'Asamblea de noviembre: la cuota sube a $800';

const january: History[number] = {
  effectiveFrom: '2027-01-01',
  amount: 80000,
  agreement: { on: '2026-11-10', summary: AGREEMENT },
  upcoming: true,
  withdrawable: true,
};

describe('ParametersPage', () => {
  afterEach(() => {
    connectSession(null);
    vi.unstubAllGlobals();
  });

  it('shows everyone the rates, without changing them unless they hold the shift', async () => {
    fakeApi({
      'POST /api/auth/refresh': sessionFor(superadmin),
      'GET /api/rates': () => Response.json(rates(false)),
    });
    renderApp('/parameters');

    const fee = await screen.findByRole('region', { name: 'Cuota de mantenimiento' });
    expect(within(fee).getByText('$700.00')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Basura' })).toHaveTextContent('$150.00');
    expect(screen.queryByRole('button', { name: /Programar cambio/ })).not.toBeInTheDocument();
  });

  it('lets the shift administrator record a change the assembly agreed', async () => {
    const api = fakeApi({
      'POST /api/auth/refresh': sessionFor(owner501),
      'GET /api/rates': () => Response.json(rates(true)),
      'POST /api/rates/changes': () => Response.json(january, { status: 201 }),
    });
    renderApp('/parameters');

    await userEvent.click(
      await screen.findByRole('button', { name: 'Programar cambio de cuota de mantenimiento' }),
    );
    expect(await screen.findByText(/lo más pronto, diciembre 2026/)).toBeInTheDocument();
    const from = screen.getByLabelText('Desde');
    await userEvent.clear(from);
    await userEvent.type(from, '2027-01');
    await userEvent.type(screen.getByLabelText('Importe ($)'), '800');
    const agreedOn = screen.getByLabelText('Fecha de la asamblea');
    await userEvent.clear(agreedOn);
    await userEvent.type(agreedOn, '2026-11-10');
    await userEvent.type(screen.getByLabelText('Qué se acordó'), AGREEMENT);
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await vi.waitFor(() => expect(api.callsTo('POST /api/rates/changes')).toHaveLength(1));
    expect(api.callsTo('POST /api/rates/changes')[0]?.body).toEqual({
      rate: 'maintenanceFee',
      from: '2027-01',
      amount: 80000,
      agreedOn: '2026-11-10',
      agreement: AGREEMENT,
    });
  });

  it('asks for the amount and the agreement before sending, and shows the API’s refusal', async () => {
    const api = fakeApi({
      'POST /api/auth/refresh': sessionFor(owner501),
      'GET /api/rates': () => Response.json(rates(true)),
      'POST /api/rates/changes': () => problem(409, 'RATE_CHANGE_TOO_EARLY'),
    });
    renderApp('/parameters');

    await userEvent.click(
      await screen.findByRole('button', { name: 'Programar cambio de basura' }),
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Escribe un importe mayor que cero')).toBeInTheDocument();
    expect(screen.getByText('Escribe qué se acordó')).toBeInTheDocument();
    expect(api.callsTo('POST /api/rates/changes')).toHaveLength(0);

    await userEvent.type(screen.getByLabelText('Importe ($)'), '160');
    await userEvent.type(screen.getByLabelText('Qué se acordó'), 'Asamblea');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText(/Ese mes ya se abrió y cobró sus cuotas/)).toBeInTheDocument();
  });

  it('shows a scheduled change with its agreement, and lets it be taken back', async () => {
    const api = fakeApi({
      'POST /api/auth/refresh': sessionFor(owner501),
      'GET /api/rates': () => Response.json(rates(true, [...unchanged(70000), january])),
      'DELETE /api/rates/changes/maintenanceFee/2027-01': () => new Response(null, { status: 204 }),
    });
    renderApp('/parameters');

    const scheduled = await screen.findByRole('list', { name: 'Cambios programados' });
    expect(within(scheduled).getByText('Desde enero 2027: $800.00')).toBeInTheDocument();
    expect(within(scheduled).getByText(/Asamblea de noviembre/)).toBeInTheDocument();
    await userEvent.click(within(scheduled).getByRole('button', { name: /^Quitar/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Sí, quitar' }));

    await vi.waitFor(() =>
      expect(api.callsTo('DELETE /api/rates/changes/maintenanceFee/2027-01')).toHaveLength(1),
    );
  });

  it('is reachable from «Más»', async () => {
    fakeApi({ 'POST /api/auth/refresh': sessionFor(owner501) });
    renderApp('/more');

    expect(await screen.findByRole('link', { name: /Parámetros/ })).toHaveAttribute(
      'href',
      '/parameters',
    );
  });
});
