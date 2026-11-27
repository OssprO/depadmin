import type { AccountEmail } from '@depadmin/shared';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectSession } from '@/lib/http';
import { fakeApi, owner501, problem, sessionFor } from '@/test/fake-api';
import { renderApp } from '@/test/render-app';

const TOKEN = '0b9d8f5e-7c2a-4f4e-9d6b-3f1e2a7c5b10.NOTICES.c2lnbmF0dXJh';

describe('the optional emails (ADR-0034)', () => {
  afterEach(() => {
    connectSession(null);
    vi.unstubAllGlobals();
  });

  it('turns the notices off and on in Mi cuenta', async () => {
    let current: AccountEmail = { email: 'vecina@ejemplo.mx', pendingEmail: null, optOuts: [] };
    const api = fakeApi({
      'POST /api/auth/refresh': sessionFor(owner501),
      'GET /api/account/email': () => Response.json(current),
      'PUT /api/account/email/topics/NOTICES': ({ body }) => {
        const { receive } = body as { receive: boolean };
        current = { ...current, optOuts: receive ? [] : ['NOTICES'] };
        return Response.json(current);
      },
    });
    renderApp('/account');

    const notices = await screen.findByRole('switch', { name: 'Avisos del edificio' });
    expect(notices).toBeChecked();
    expect(screen.getByText(/te llegan siempre/)).toBeInTheDocument();
    await userEvent.click(notices);

    await waitFor(() => expect(notices).not.toBeChecked());
    expect(api.callsTo('PUT /api/account/email/topics/NOTICES')[0]?.body).toEqual({
      receive: false,
    });
    await userEvent.click(notices);
    await waitFor(() => expect(notices).toBeChecked());
  });

  it('says notices arrive once the address is confirmed', async () => {
    fakeApi({
      'POST /api/auth/refresh': sessionFor(owner501),
      'GET /api/account/email': () =>
        Response.json({ email: null, pendingEmail: 'vecina@ejemplo.mx', optOuts: [] }),
    });
    renderApp('/account');

    expect(await screen.findByText(/Te llegarán cuando confirmes tu correo/)).toBeInTheDocument();
  });

  describe('the link at the foot of an email', () => {
    it('stops the notices only when its button is pressed, without a session', async () => {
      const api = fakeApi({
        'POST /api/auth/refresh': () => problem(401, 'SESSION_INVALID'),
        [`POST /api/email/unsubscribe/${TOKEN}`]: () =>
          Response.json({ topic: 'NOTICES', accounts: ['admin', '501'] }),
      });
      renderApp(`/email/unsubscribe#${TOKEN}`);

      const button = await screen.findByRole('button', { name: 'Dejar de recibirlos' });
      expect(api.callsTo(`POST /api/email/unsubscribe/${TOKEN}`)).toEqual([]);
      await userEvent.click(button);

      expect(await screen.findByRole('status')).toHaveTextContent(
        'Listo: las cuentas «admin» y «501» ya no reciben los avisos por correo.',
      );
      expect(screen.getByRole('link', { name: 'Ir a la app' })).toHaveAttribute('href', '/');
    });

    it('explains a link that no longer works, or came incomplete', async () => {
      fakeApi({
        [`POST /api/email/unsubscribe/${TOKEN}`]: () => problem(422, 'UNSUBSCRIBE_LINK_INVALID'),
      });
      const { unmount } = renderApp(`/email/unsubscribe#${TOKEN}`);

      await userEvent.click(await screen.findByRole('button', { name: 'Dejar de recibirlos' }));
      expect(await screen.findByText(/Este enlace ya no sirve/)).toBeInTheDocument();
      unmount();

      renderApp('/email/unsubscribe');
      expect(await screen.findByText(/Este enlace está incompleto/)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Dejar de recibirlos' })).not.toBeInTheDocument();
    });
  });
});
