import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectSession } from '@/lib/http';
import { fakeApi, problem } from '@/test/fake-api';
import { renderApp } from '@/test/render-app';

const anonymous = { 'POST /api/auth/refresh': () => problem(401, 'SESSION_INVALID') };
const available = (yes: boolean) => () => Response.json({ available: yes });

describe('password recovery', () => {
  afterEach(() => {
    connectSession(null);
    vi.unstubAllGlobals();
  });

  it('is offered on the login once emails go out, and the superadmin otherwise', async () => {
    fakeApi({ ...anonymous, 'GET /api/auth/password-recovery': available(true) });
    renderApp('/login');

    await userEvent.click(await screen.findByRole('link', { name: '¿Olvidaste tu contraseña?' }));

    expect(await screen.findByRole('heading', { name: 'Recuperar tu contraseña' })).toBeVisible();
  });

  it('keeps sending to the superadmin while emails do not go out', async () => {
    fakeApi({ ...anonymous, 'GET /api/auth/password-recovery': available(false) });
    renderApp('/login');

    expect(
      await screen.findByText('¿Olvidaste tu contraseña? Pídele al superadmin una temporal.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '¿Olvidaste tu contraseña?' })).toBeNull();

    renderApp('/forgot-password');
    expect(
      await screen.findByText(/La recuperación por correo todavía no está disponible/),
    ).toBeInTheDocument();
  });

  it('asks for the username and answers the same whoever it is', async () => {
    const api = fakeApi({
      ...anonymous,
      'GET /api/auth/password-recovery': available(true),
      'POST /api/auth/password-recovery': () => new Response(null, { status: 202 }),
    });
    renderApp('/forgot-password');

    await userEvent.click(await screen.findByRole('button', { name: 'Enviar enlace' }));
    expect(await screen.findByText('Escribe tu usuario')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Usuario'), ' 501 ');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar enlace' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      /Si ese usuario tiene un correo confirmado, te enviamos un enlace. Vence en 1 hora/,
    );
    expect(api.callsTo('POST /api/auth/password-recovery')[0]?.body).toEqual({ username: '501' });
  });

  it('explains the hourly limit', async () => {
    fakeApi({
      ...anonymous,
      'GET /api/auth/password-recovery': available(true),
      'POST /api/auth/password-recovery': () => problem(429, 'TOO_MANY_REQUESTS'),
    });
    renderApp('/forgot-password');

    await userEvent.type(await screen.findByLabelText('Usuario'), '501');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar enlace' }));

    expect(await screen.findByText(/Espera una hora/)).toBeInTheDocument();
  });

  it('takes a new password from the link, for the account it names, and offers to sign in', async () => {
    const api = fakeApi({
      ...anonymous,
      'POST /api/auth/password-recovery/check': () => Response.json({ username: '501' }),
      'POST /api/auth/password-recovery/complete': () => new Response(null, { status: 204 }),
    });
    const { router } = renderApp('/reset-password#secreto_123');

    expect(await screen.findByText('Para la cuenta «501».')).toBeInTheDocument();
    expect(api.callsTo('POST /api/auth/password-recovery/check')[0]?.body).toEqual({
      token: 'secreto_123',
    });
    await userEvent.type(screen.getByLabelText('Nueva contraseña'), 'la casa del 501');
    await userEvent.type(screen.getByLabelText('Repite la nueva contraseña'), 'la casa del 50');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar contraseña' }));
    expect(await screen.findByText('Las contraseñas no coinciden')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Repite la nueva contraseña'), '1');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar contraseña' }));

    expect(await screen.findByRole('status')).toHaveTextContent(/tu contraseña cambió/);
    expect(api.callsTo('POST /api/auth/password-recovery/complete')[0]?.body).toEqual({
      token: 'secreto_123',
      newPassword: 'la casa del 501',
    });
    await waitFor(() => expect(router.state.location.hash).toBe(''));
    expect(screen.getByRole('link', { name: 'Iniciar sesión' })).toBeInTheDocument();
  });

  it('says when the link no longer works, and offers another', async () => {
    fakeApi({
      ...anonymous,
      'POST /api/auth/password-recovery/check': () => problem(409, 'RECOVERY_LINK_INVALID'),
    });
    renderApp('/reset-password#vencido');

    expect(await screen.findByText(/Este enlace ya no sirve/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pedir otro enlace' })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
  });

  it('says when the link came without its secret', async () => {
    const api = fakeApi(anonymous);
    renderApp('/reset-password');

    expect(await screen.findByText(/Este enlace está incompleto/)).toBeInTheDocument();
    expect(api.callsTo('POST /api/auth/password-recovery/check')).toHaveLength(0);
  });
});
