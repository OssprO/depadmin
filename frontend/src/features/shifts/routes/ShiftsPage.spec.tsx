import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectSession } from '@/lib/http';
import { fakeApi, owner501, sessionFor, superadmin } from '@/test/fake-api';
import { renderApp } from '@/test/render-app';
import { currentShift, shiftMonth, skip502 } from '@/test/shifts';

describe('shifts', () => {
  afterEach(() => {
    connectSession(null);
    vi.unstubAllGlobals();
  });

  it('shows the current shift on the dashboard and reminds the outgoing owner', async () => {
    fakeApi({
      'POST /api/auth/refresh': sessionFor(owner501),
      'GET /api/shifts/current': () =>
        Response.json(currentShift({ current: shiftMonth('2026-10', { canDelegate: true }) })),
    });
    renderApp('/');

    expect(await screen.findByText('oct–nov 2026: Depto 502')).toBeInTheDocument();
    expect(screen.getByRole('listitem', { name: 'Depto 502, En turno' })).toBeInTheDocument();
    expect(screen.getByText(/Sigue: Depto 401/)).toBeInTheDocument();
    expect(screen.getByText(/Si Depto 502 no toma el turno/)).toBeInTheDocument();
  });

  it('lets the outgoing owner record that the next depto skips its shift', async () => {
    const api = fakeApi({
      'POST /api/auth/refresh': sessionFor(owner501),
      'GET /api/shifts/current': () => Response.json(currentShift()),
      'GET /api/shifts/calendar': () =>
        Response.json(
          ['2026-10', '2026-11', '2026-12', '2027-01'].map((month) =>
            shiftMonth(month, { canDelegate: month === '2026-10' }),
          ),
        ),
      'POST /api/shifts/delegations': () => Response.json(skip502, { status: 201 }),
    });
    renderApp('/shifts');

    const period = await screen.findByRole('region', { name: 'Turno oct–nov 2026' });
    expect(within(period).getByText('Actual')).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Turno dic 2026 – ene 2027' })).queryByRole(
        'button',
      ),
    ).not.toBeInTheDocument();
    await userEvent.click(within(period).getByRole('button', { name: 'Registrar entrega' }));
    await userEvent.selectOptions(await screen.findByLabelText('Quién lo cubre'), 'Depto 501');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await vi.waitFor(() => expect(api.callsTo('POST /api/shifts/delegations')).toHaveLength(1));
    expect(api.callsTo('POST /api/shifts/delegations')[0]?.body).toEqual({
      from: '2026-10',
      to: '2026-11',
      delegateUnit: 501,
      reason: 'SKIPPED_SHIFT',
    });
    await vi.waitFor(() =>
      expect(api.callsTo('GET /api/shifts/calendar').length).toBeGreaterThan(1),
    );
  });

  it('asks who covers before saving', async () => {
    const api = fakeApi({
      'POST /api/auth/refresh': sessionFor(owner501),
      'GET /api/shifts/current': () => Response.json(currentShift()),
      'GET /api/shifts/calendar': () =>
        Response.json([shiftMonth('2026-10', { canDelegate: true }), shiftMonth('2026-11')]),
    });
    renderApp('/shifts');

    await userEvent.click(await screen.findByRole('button', { name: 'Registrar entrega' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Elige un depto')).toBeInTheDocument();
    expect(api.callsTo('POST /api/shifts/delegations')).toHaveLength(0);
  });

  it('lets the superadmin cancel a delegation', async () => {
    const api = fakeApi({
      'POST /api/auth/refresh': sessionFor(superadmin),
      'GET /api/shifts/current': () => Response.json(currentShift()),
      'GET /api/shifts/calendar': () =>
        Response.json([
          shiftMonth('2026-10', { delegation: skip502 }),
          shiftMonth('2026-11', { delegation: skip502 }),
        ]),
      [`POST /api/shifts/delegations/${skip502.id}/cancel`]: () => Response.json(skip502),
    });
    renderApp('/shifts');

    expect(
      await screen.findByText('Depto 501 cubre a Depto 502 (no tomó el turno).'),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(await screen.findByText(/se le retiran las multas/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Sí, cancelar' }));

    await vi.waitFor(() =>
      expect(api.callsTo(`POST /api/shifts/delegations/${skip502.id}/cancel`)).toHaveLength(1),
    );
  });
});
