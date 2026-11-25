import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectSession } from '@/lib/http';
import { fakeApi, owner501, sessionFor, superadmin, tenant302 } from '@/test/fake-api';
import { renderApp } from '@/test/render-app';

const DEFAULT_TITLE = 'DepAdmin · Edificio Correspondencia 63';

const wideScreen = () =>
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: query === '(min-width: 48rem)',
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList,
  );

describe('the account badge', () => {
  beforeEach(() => {
    document.title = DEFAULT_TITLE;
  });
  afterEach(() => {
    connectSession(null);
    vi.unstubAllGlobals();
  });

  it.each([
    [owner501, 'Cuenta: Depto 501, dueño', '501', 'DepAdmin · 501'],
    [superadmin, 'Cuenta: admin, superadmin', '', 'DepAdmin · Superadmin'],
    [tenant302, 'Cuenta: inquilino.302, solo lectura', 'I', 'DepAdmin · inquilino.302'],
  ])('says who is signed in on the phone: %#', async (user, name, circle, title) => {
    fakeApi({ 'POST /api/auth/refresh': sessionFor(user) });
    renderApp('/tools');

    const badge = await screen.findByRole('link', { name });
    expect(badge).toHaveAttribute('href', '/account');
    // Only the circle shows; the superadmin's holds the wrench of «Administración».
    const shown = badge.querySelector('[data-slot="account-circle"]');
    expect(shown?.textContent).toBe(circle);
    if (user === superadmin) expect(shown?.querySelector('svg')).toBeInTheDocument();
    expect(document.title).toBe(title);
  });

  it('names the account and its role in the side menu, and opens «Mi cuenta»', async () => {
    wideScreen();
    fakeApi({ 'POST /api/auth/refresh': sessionFor(owner501) });
    const { router } = renderApp('/tools');

    const badge = await screen.findByRole('link', { name: 'Cuenta: Depto 501, dueño' });
    expect(badge.closest('aside')).toBeInTheDocument();
    expect(within(badge).getByText('Depto 501')).toBeInTheDocument();
    expect(within(badge).getByText('Dueño')).toBeInTheDocument();
    await userEvent.click(badge);
    await waitFor(() => expect(router.state.location.pathname).toBe('/account'));
  });

  it('gives the tab its usual title back when the session ends', async () => {
    fakeApi({
      'POST /api/auth/refresh': sessionFor(owner501),
      'POST /api/auth/logout': () => new Response(null, { status: 204 }),
    });
    const { router } = renderApp('/account');

    await screen.findByRole('heading', { name: 'Mi cuenta' });
    expect(document.title).toBe('DepAdmin · 501');
    await userEvent.click(screen.getByRole('button', { name: /Cerrar sesión/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(document.title).toBe(DEFAULT_TITLE);
  });

  it('is not a link while a temporary password leaves nowhere else to go', async () => {
    fakeApi({ 'POST /api/auth/refresh': sessionFor({ ...owner501, mustChangePassword: true }) });
    renderApp('/account');

    await screen.findByRole('heading', { name: 'Elige tu contraseña' });
    expect(screen.getByText('Cuenta: Depto 501, dueño')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^Cuenta:/ })).not.toBeInTheDocument();
  });
});
