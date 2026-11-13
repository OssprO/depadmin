import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectSession } from '@/lib/http';
import { fakeApi, owner501, problem, sessionFor } from '@/test/fake-api';
import { renderApp } from '@/test/render-app';
import { GUIDE } from '../guide';

describe('the user guide', () => {
  afterEach(() => {
    connectSession(null);
    vi.unstubAllGlobals();
  });

  it('is open to visitors, from the login screen, without asking the API', async () => {
    const api = fakeApi({ 'POST /api/auth/refresh': () => problem(401, 'SESSION_INVALID') });
    const { router } = renderApp('/login');

    await userEvent.click(await screen.findByRole('link', { name: 'Lee la guía paso a paso' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Ayuda' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/help');
    const topics = within(screen.getByRole('list')).getAllByRole('link');
    expect(topics).toHaveLength(GUIDE.length);
    expect(screen.getByRole('link', { name: 'Descargar la guía en PDF' })).toHaveAttribute(
      'href',
      '/guia-depadmin.pdf',
    );
    expect(api.callsTo('POST /api/auth/refresh')).toHaveLength(1);
  });

  it('walks a task step by step and leads to the next one', async () => {
    fakeApi({});
    const { router } = renderApp('/help/sign-in');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Entrar por primera vez' }),
    ).toBeInTheDocument();
    const steps = within(screen.getAllByRole('list')[0]!).getAllByRole('listitem');
    expect(steps).toHaveLength(4);
    expect(within(steps[2]!).getByRole('img')).toHaveAttribute('src', '/help/choose-password.png');
    expect(screen.getByRole('complementary', { name: 'Consejos' })).toHaveTextContent(
      /Pídele al administrador una temporal/,
    );

    await userEvent.click(screen.getByRole('link', { name: /Siguiente: Cambiar tu contraseña/ }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Cambiar tu contraseña' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/help/change-password');
  });

  it('splits the install steps by phone, with no screenshots of the browser', async () => {
    fakeApi({});
    renderApp('/help/install');

    expect(
      await screen.findByRole('heading', { level: 2, name: 'En Android (Chrome)' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'En iPhone (Safari)' }),
    ).toBeInTheDocument();
    expect(screen.queryAllByRole('img')).toHaveLength(0);
  });

  it('says so for a task that does not exist', async () => {
    fakeApi({});
    renderApp('/help/no-such-task');

    expect(await screen.findByText('Esta página no existe.')).toBeInTheDocument();
  });

  it('prints every task on one page, for the PDF', async () => {
    fakeApi({});
    renderApp('/help/print');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Guía de DepAdmin' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(GUIDE.length);
    for (const image of screen.getAllByRole('img'))
      expect(image).toHaveAttribute('loading', 'eager');
  });

  it('is in «Más» for whoever is signed in', async () => {
    fakeApi({ 'POST /api/auth/refresh': sessionFor(owner501) });
    renderApp('/more');

    await userEvent.click(await screen.findByRole('link', { name: /Ayuda/ }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Ayuda' })).toBeInTheDocument();
  });
});
