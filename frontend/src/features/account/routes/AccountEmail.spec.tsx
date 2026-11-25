import type { AccountEmail } from '@depadmin/shared';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectSession } from '@/lib/http';
import { fakeApi, owner501, problem, sessionFor, superadmin } from '@/test/fake-api';
import { renderApp } from '@/test/render-app';

const none: AccountEmail = { email: null, pendingEmail: null };

describe('email in Mi cuenta', () => {
  afterEach(() => {
    connectSession(null);
    vi.unstubAllGlobals();
  });

  it('adds an address, which waits for its link, and resends it', async () => {
    let current = none;
    const api = fakeApi({
      'POST /api/auth/refresh': sessionFor(owner501),
      'GET /api/account/email': () => Response.json(current),
      'PUT /api/account/email': ({ body }) => {
        current = { email: null, pendingEmail: (body as { email: string }).email };
        return Response.json(current);
      },
    });
    renderApp('/account');

    expect(await screen.findByText('Aún no tienes correo.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Agregar correo' }));
    await userEvent.type(await screen.findByLabelText('Correo'), 'Vecina@Ejemplo.MX ');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar y enviar el enlace' }));

    expect(await screen.findByText('Sin confirmar')).toBeInTheDocument();
    expect(screen.getByText('vecina@ejemplo.mx')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Te enviamos el enlace a vecina@ejemplo.mx.',
    );

    await userEvent.click(screen.getByRole('button', { name: 'Reenviar el enlace' }));
    await waitFor(() => expect(api.callsTo('PUT /api/account/email')).toHaveLength(2));
    expect(api.callsTo('PUT /api/account/email')[1]?.body).toEqual({ email: 'vecina@ejemplo.mx' });
  });

  it('says the confirmed one keeps working while a new one waits, and explains the limit', async () => {
    fakeApi({
      'POST /api/auth/refresh': sessionFor(owner501),
      'GET /api/account/email': () =>
        Response.json({ email: 'antes@ejemplo.mx', pendingEmail: 'nueva@ejemplo.mx' }),
      'PUT /api/account/email': () => problem(409, 'EMAIL_CONFIRMATION_LIMIT'),
    });
    renderApp('/account');

    expect(await screen.findByText('Confirmado')).toBeInTheDocument();
    expect(
      screen.getByText(/Mientras tanto, la recuperación sigue llegando a antes@ejemplo.mx/),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reenviar el enlace' }));
    expect(await screen.findByText(/Ya enviamos 3 correos de confirmación/)).toBeInTheDocument();
  });

  it('removes it after asking', async () => {
    const api = fakeApi({
      'POST /api/auth/refresh': sessionFor(owner501),
      'GET /api/account/email': () =>
        Response.json({ email: 'vecina@ejemplo.mx', pendingEmail: null }),
      'DELETE /api/account/email': () => Response.json(none),
    });
    renderApp('/account');

    await userEvent.click(await screen.findByRole('button', { name: 'Quitar' }));
    expect(await screen.findByText(/tendrás que pedirle una temporal al superadmin/)).toBeVisible();
    await userEvent.click(screen.getAllByRole('button', { name: 'Quitar' }).at(-1)!);

    expect(await screen.findByText('Aún no tienes correo.')).toBeInTheDocument();
    expect(api.callsTo('DELETE /api/account/email')).toHaveLength(1);
  });

  it('confirms it from the link, through the login when there is no session', async () => {
    let signedIn = false;
    const api = fakeApi({
      'POST /api/auth/refresh': () =>
        signedIn ? sessionFor(owner501)() : problem(401, 'SESSION_INVALID'),
      'POST /api/auth/login': () => {
        signedIn = true;
        return sessionFor(owner501)();
      },
      'POST /api/account/email/confirm': () =>
        Response.json({ email: 'vecina@ejemplo.mx', pendingEmail: null }),
    });
    renderApp('/account/email/confirm#secreto_123');

    await userEvent.type(await screen.findByLabelText('Usuario'), '501');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'la casa del 501');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText(/quedó confirmado/)).toBeInTheDocument();
    expect(api.callsTo('POST /api/account/email/confirm')).toEqual([
      expect.objectContaining({ body: { token: 'secreto_123' } }),
    ]);
  });

  it('says so when the link is for another account', async () => {
    fakeApi({
      'POST /api/auth/refresh': sessionFor(superadmin),
      'POST /api/account/email/confirm': () => problem(403, 'EMAIL_LINK_OTHER_ACCOUNT'),
    });
    renderApp('/account/email/confirm#secreto_123');

    expect(await screen.findByText(/Este enlace es de otra cuenta/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir a Mi cuenta' })).toBeInTheDocument();
  });
});
