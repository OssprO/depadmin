import type { UserSummary } from '@depadmin/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectSession } from '@/lib/http';
import { fakeApi, sessionFor, superadmin } from '@/test/fake-api';
import { renderApp } from '@/test/render-app';

const access = { expiresOn: null, disabled: false, expired: false };
const OWNER_ID = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const TENANT_ID = '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e';

const users: UserSummary[] = [
  { ...superadmin, hasPassword: true, ...access },
  {
    id: OWNER_ID,
    username: '501',
    role: 'OWNER',
    unit: 501,
    mustChangePassword: false,
    hasPassword: false,
    ...access,
  },
  {
    id: TENANT_ID,
    username: 'inquilino.302',
    role: 'READER',
    unit: 302,
    mustChangePassword: false,
    hasPassword: true,
    ...access,
    expiresOn: '2026-12-31',
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
      [`POST /api/users/${OWNER_ID}/password-reset`]: () =>
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

  it("shows each user's type, depto and expiry, and nothing to change for the superadmin", async () => {
    fakeApi({
      'POST /api/auth/refresh': sessionFor(superadmin),
      'GET /api/users': () =>
        Response.json([
          ...users,
          {
            ...users[2]!,
            id: OWNER_ID.replace('1a', '3c'),
            username: 'contador',
            unit: null,
            disabled: true,
            expiresOn: null,
          },
        ]),
    });
    renderApp('/admin/users');

    const tenant = (await screen.findByText('inquilino.302')).closest('li')!;
    expect(
      within(tenant).getByText('Solo lectura · Depto 302 · vence el 31 de diciembre de 2026'),
    ).toBeInTheDocument();
    const accountant = screen.getByText('contador').closest('li')!;
    expect(within(accountant).getByText('Desactivado')).toBeInTheDocument();
    expect(within(accountant).getByText('Solo lectura · sin depto')).toBeInTheDocument();
    const admin = screen.getByText('admin').closest('li')!;
    expect(within(admin).queryByRole('button')).not.toBeInTheDocument();
  });

  it('creates a read-only user and shows its temporary password once', async () => {
    const api = fakeApi({
      'POST /api/auth/refresh': sessionFor(superadmin),
      'GET /api/users': () => Response.json(users),
      'POST /api/users': () =>
        Response.json(
          {
            user: { ...users[2]!, username: 'familia.401', unit: 401 },
            temporaryPassword: 'tmp-1234-5678',
          },
          { status: 201 },
        ),
    });
    renderApp('/admin/users');

    await userEvent.click(
      await screen.findByRole('button', { name: /Nuevo usuario de solo lectura/ }),
    );
    await userEvent.type(screen.getByLabelText('Usuario'), '401');
    await userEvent.click(screen.getByRole('button', { name: 'Crear usuario' }));
    expect(await screen.findByText('Solo números es el usuario de un dueño')).toBeInTheDocument();
    expect(api.callsTo('POST /api/users')).toHaveLength(0);

    await userEvent.clear(screen.getByLabelText('Usuario'));
    await userEvent.type(screen.getByLabelText('Usuario'), 'Familia.401');
    await userEvent.selectOptions(screen.getByLabelText('Depto'), 'Depto 401');
    await userEvent.type(screen.getByLabelText('Vence'), '2027-01-31');
    await userEvent.click(screen.getByRole('button', { name: 'Crear usuario' }));

    expect(await screen.findByTestId('temporary-password')).toHaveTextContent('tmp-1234-5678');
    expect(api.callsTo('POST /api/users')[0]?.body).toEqual({
      username: 'familia.401',
      unit: 401,
      expiresOn: '2027-01-31',
    });
  });

  it("changes a user's access and switches it off", async () => {
    const api = fakeApi({
      'POST /api/auth/refresh': sessionFor(superadmin),
      'GET /api/users': () => Response.json(users),
      [`PUT /api/users/${TENANT_ID}/access`]: () => Response.json(users[2]),
      [`POST /api/users/${TENANT_ID}/disable`]: () =>
        Response.json({ ...users[2], disabled: true }),
    });
    renderApp('/admin/users');

    const tenant = (await screen.findByText('inquilino.302')).closest('li')!;
    await userEvent.click(within(tenant).getByRole('button', { name: 'Acceso' }));
    await userEvent.selectOptions(
      await screen.findByLabelText('Depto'),
      'Ninguno (por ejemplo, un contador)',
    );
    await userEvent.clear(screen.getByLabelText('Vence'));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await vi.waitFor(() =>
      expect(api.callsTo(`PUT /api/users/${TENANT_ID}/access`)[0]?.body).toEqual({
        unit: null,
        expiresOn: null,
      }),
    );

    await userEvent.click(within(tenant).getByRole('button', { name: 'Acceso' }));
    await userEvent.click(await screen.findByRole('button', { name: /Desactivar/ }));
    await vi.waitFor(() =>
      expect(api.callsTo(`POST /api/users/${TENANT_ID}/disable`)).toHaveLength(1),
    );
  });
});
