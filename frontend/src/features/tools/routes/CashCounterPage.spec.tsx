import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectSession } from '@/lib/http';
import { fakeApi, sessionFor, tenant302 } from '@/test/fake-api';
import { renderApp } from '@/test/render-app';

const totalRow = () => screen.getByText('Total').parentElement!;

describe('tools', () => {
  afterEach(() => {
    connectSession(null);
    vi.unstubAllGlobals();
  });

  it('reaches the cash counter from «Más», for anyone signed in', async () => {
    fakeApi({ 'POST /api/auth/refresh': sessionFor(tenant302) });
    const { router } = renderApp('/more');

    await userEvent.click(await screen.findByRole('link', { name: /Herramientas/ }));
    expect(await screen.findByRole('heading', { name: 'Herramientas' })).toBeVisible();
    await userEvent.click(await screen.findByRole('link', { name: /Contador de efectivo/ }));

    expect(await screen.findByRole('heading', { name: 'Contador de efectivo' })).toBeVisible();
    expect(router.state.location.pathname).toBe('/tools/cash');
  });

  it('adds up the pieces as they are typed, and «Limpiar» starts over', async () => {
    const api = fakeApi({ 'POST /api/auth/refresh': sessionFor(tenant302) });
    renderApp('/tools/cash');

    const fivehundreds = await screen.findByLabelText('Billetes de $500');
    expect(screen.getByRole('button', { name: 'Limpiar' })).toBeDisabled();
    await userEvent.type(fivehundreds, '3');
    await userEvent.type(screen.getByLabelText('Monedas de $20'), '2');
    // Only whole pieces: the point is dropped.
    await userEvent.type(screen.getByLabelText('Monedas de 50¢'), '7.');

    expect(screen.getByLabelText('Monedas de 50¢')).toHaveValue('7');
    expect(within(fivehundreds.closest('li')!).getByText('$1,500.00')).toBeVisible();
    expect(within(totalRow()).getByText('$1,543.50')).toBeVisible();
    const totals = within(totalRow().closest('dl')!);
    expect(totals.getByText('Billetes').parentElement).toHaveTextContent('Billetes$1,500.00');
    expect(totals.getByText('Monedas').parentElement).toHaveTextContent('Monedas$43.50');

    await userEvent.click(screen.getByRole('button', { name: 'Limpiar' }));
    expect(within(totalRow()).getByText('$0.00')).toBeVisible();
    expect(fivehundreds).toHaveValue('');
    expect(screen.getByLabelText('Billetes de $1,000')).toHaveFocus();
    // Nothing is saved or sent: the session is the only call.
    expect(api.calls.map((call) => call.route)).toEqual(['POST /api/auth/refresh']);
  });

  it('moves to the next denomination on Enter, across bills and coins', async () => {
    fakeApi({ 'POST /api/auth/refresh': sessionFor(tenant302) });
    renderApp('/tools/cash');

    await userEvent.type(await screen.findByLabelText('Billetes de $20'), '4{Enter}');
    expect(screen.getByLabelText('Monedas de $20')).toHaveFocus();
    await userEvent.type(screen.getByLabelText('Monedas de 50¢'), '1{Enter}');
    expect(document.body).toHaveFocus();
    expect(within(totalRow()).getByText('$80.50')).toBeVisible();
  });
});
