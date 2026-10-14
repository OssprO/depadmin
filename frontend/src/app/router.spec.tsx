import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectSession } from '@/lib/http';
import { fakeApi, owner501, problem, sessionFor, superadmin } from '@/test/fake-api';
import { renderApp } from '@/test/render-app';

const health = () =>
  Response.json({
    status: 'ok',
    version: '1.0.0',
    uptimeSeconds: 60,
    timestamp: '2026-10-13T12:00:00.000Z',
  });

describe('navigation and session', () => {
  afterEach(() => {
    connectSession(null);
    vi.unstubAllGlobals();
  });

  it('sends visitors to the login, then back to where they were going', async () => {
    fakeApi({
      'POST /api/auth/refresh': () => problem(401, 'SESSION_INVALID'),
      'POST /api/auth/login': sessionFor(superadmin),
      'GET /api/users': () => Response.json([]),
    });
    const { router } = renderApp('/admin/users');

    await userEvent.type(await screen.findByLabelText('Usuario'), 'admin');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'admin password');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('heading', { name: 'Usuarios' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/admin/users');
  });

  it('explains a failed login', async () => {
    fakeApi({
      'POST /api/auth/refresh': () => problem(401, 'SESSION_INVALID'),
      'POST /api/auth/login': () => problem(401, 'INVALID_CREDENTIALS'),
    });
    renderApp('/');

    await userEvent.type(await screen.findByLabelText('Usuario'), '501');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText('Usuario o contraseña incorrectos.')).toBeInTheDocument();
  });

  it('validates the login form before calling the API', async () => {
    const api = fakeApi({ 'POST /api/auth/refresh': () => problem(401, 'SESSION_INVALID') });
    renderApp('/login');

    await userEvent.click(await screen.findByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText('Escribe tu usuario')).toBeInTheDocument();
    expect(api.callsTo('POST /api/auth/login')).toHaveLength(0);
  });

  it('resumes the session on reload and keeps owners out of admin screens', async () => {
    fakeApi({ 'POST /api/auth/refresh': sessionFor(owner501), 'GET /api/health': health });
    const { router } = renderApp('/admin/users');

    expect(await screen.findByRole('heading', { name: 'Hola, Depto 501' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
    expect(screen.queryByRole('link', { name: /Usuarios/ })).not.toBeInTheDocument();
  });

  it('sends a signed-in user away from the login screen', async () => {
    fakeApi({ 'POST /api/auth/refresh': sessionFor(owner501), 'GET /api/health': health });
    const { router } = renderApp('/login');

    await screen.findByRole('heading', { name: 'Hola, Depto 501' });
    expect(router.state.location.pathname).toBe('/');
  });

  it('requires a new password after a reset before anything else', async () => {
    const temporary = { ...owner501, mustChangePassword: true };
    fakeApi({
      'POST /api/auth/refresh': sessionFor(temporary),
      'POST /api/auth/password': sessionFor(owner501, 'after-change'),
      'GET /api/health': health,
    });
    const { router } = renderApp('/account');

    expect(await screen.findByRole('heading', { name: 'Elige tu contraseña' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Contraseña temporal'), 'abcd-efgh-jkmn-pqrs');
    await userEvent.type(screen.getByLabelText('Nueva contraseña'), 'la casa del 501');
    await userEvent.type(screen.getByLabelText('Repite la nueva contraseña'), 'la casa del 502');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar contraseña' }));
    expect(await screen.findByText('Las contraseñas no coinciden')).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText('Repite la nueva contraseña'));
    await userEvent.type(screen.getByLabelText('Repite la nueva contraseña'), 'la casa del 501');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar contraseña' }));

    expect(await screen.findByRole('heading', { name: 'Hola, Depto 501' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });

  it('signs out and returns to the login', async () => {
    const api = fakeApi({
      'POST /api/auth/refresh': sessionFor(owner501),
      'POST /api/auth/logout': () => new Response(null, { status: 204 }),
    });
    const { router } = renderApp('/account');

    await userEvent.click(await screen.findByRole('button', { name: /Cerrar sesión/ }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(api.callsTo('POST /api/auth/logout')).toHaveLength(1);
  });

  it('offers a retry when the server cannot be reached on load', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    renderApp('/');

    expect(await screen.findByText(/No se pudo contactar al servidor/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reintentar/ })).toBeInTheDocument();
  });
});
