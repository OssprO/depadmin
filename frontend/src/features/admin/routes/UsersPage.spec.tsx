import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectSession } from '@/lib/http';
import { fakeApi, sessionFor, superadmin } from '@/test/fake-api';
import { renderApp } from '@/test/render-app';

const users = [
  { ...superadmin, hasPassword: true },
  {
    id: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
    username: '501',
    role: 'OWNER',
    unit: 501,
    mustChangePassword: false,
    hasPassword: false,
  },
];

describe('UsersPage', () => {
  afterEach(() => {
    connectSession(null);
    vi.unstubAllGlobals();
  });

  it('gives an owner access and shows the temporary password once', async () => {
    const api = fakeApi({
      'POST /api/auth/refresh': sessionFor(superadmin),
      'GET /api/users': () => Response.json(users),
      [`POST /api/users/${users[1]!.id}/password-reset`]: () =>
        Response.json({ temporaryPassword: 'k7m2-qx9p-ab3c-de4f' }),
    });
    renderApp('/admin/users');

    const row = (await screen.findByText('Depto 501')).closest('li')!;
    expect(within(row).getByText('Sin acceso')).toBeInTheDocument();
    await userEvent.click(within(row).getByRole('button', { name: 'Dar acceso' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Generar contraseña' }));

    expect(await screen.findByTestId('temporary-password')).toHaveTextContent(
      'k7m2-qx9p-ab3c-de4f',
    );
    expect(api.callsTo('GET /api/users').length).toBeGreaterThanOrEqual(2); // list refreshed
  });

  it('offers no reset for the superadmin’s own account', async () => {
    fakeApi({
      'POST /api/auth/refresh': sessionFor(superadmin),
      'GET /api/users': () => Response.json(users),
    });
    renderApp('/admin/users');

    const row = (await screen.findByText('admin')).closest('li')!;
    expect(within(row).queryByRole('button')).not.toBeInTheDocument();
  });
});
