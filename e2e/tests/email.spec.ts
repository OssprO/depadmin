import { type APIRequestContext, expect, type Page, test } from '@playwright/test';
import { BASE_URL, SUPERADMIN } from '../support/accounts.js';
import { emailTo, linkIn } from '../support/mailbox.js';

// Email and password recovery (ADR-0033), against a real SMTP server (Mailpit): a user
// confirms an address, forgets the password and recovers it from the link. It is a
// read-only user of its own, so nothing here changes the accounts the other specs use.

const USER = { username: 'correo.e2e', password: 'la contraseña de siempre' };
const ADDRESS = 'correo.e2e@depadmin.test';
const RECOVERED = 'una frase nueva y larga';

/** The user, created by the superadmin, with its own password already chosen. */
async function givenUser(request: APIRequestContext) {
  const login = await request.post('/api/auth/login', { data: SUPERADMIN });
  const { accessToken } = (await login.json()) as { accessToken: string };
  const created = await request.post('/api/users', {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: { username: USER.username, unit: null, expiresOn: null },
  });
  expect(created.ok()).toBe(true);
  const { temporaryPassword } = (await created.json()) as { temporaryPassword: string };
  const first = await request.post('/api/auth/login', {
    data: { username: USER.username, password: temporaryPassword },
  });
  const session = (await first.json()) as { accessToken: string };
  const changed = await request.post('/api/auth/password', {
    headers: { Authorization: `Bearer ${session.accessToken}` },
    data: { currentPassword: temporaryPassword, newPassword: USER.password },
  });
  expect(changed.ok()).toBe(true);
}

async function signIn(page: Page, username: string, password: string) {
  await page.getByLabel('Usuario').fill(username);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

test('confirms an email, recovers the password from it and is told of the change', async ({
  page,
  request,
}) => {
  await givenUser(request);
  await page.goto('/account');
  await signIn(page, USER.username, USER.password);

  // The address waits for its link, which opens the app on this account.
  await page.getByRole('button', { name: 'Agregar correo' }).click();
  await page.getByLabel('Correo', { exact: true }).fill(ADDRESS);
  await page.getByRole('button', { name: 'Guardar y enviar el enlace' }).click();
  await expect(page.getByText('Sin confirmar')).toBeVisible();
  const confirmation = await emailTo(ADDRESS, 'Confirma tu correo en DepAdmin');
  expect(confirmation.text).toContain(`la cuenta «${USER.username}» de DepAdmin`);
  expect(confirmation.text).toContain('No respondas: nadie lee este buzón.');
  expect(linkIn(confirmation)).toMatch(new RegExp(`^${BASE_URL}/account/email/confirm#`));
  await page.goto(linkIn(confirmation));
  await expect(page.getByText(/quedó confirmado/)).toBeVisible();
  await page.getByRole('link', { name: 'Ir a Mi cuenta' }).click();
  await expect(page.getByText('Confirmado')).toBeVisible();

  // Forgotten: the login offers the way back.
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await page.getByRole('link', { name: '¿Olvidaste tu contraseña?' }).click();
  await page.getByLabel('Usuario').fill(USER.username);
  await page.getByRole('button', { name: 'Enviar enlace' }).click();
  await expect(page.getByRole('status')).toContainText('te enviamos un enlace');
  const recovery = await emailTo(ADDRESS, 'Recupera tu contraseña de DepAdmin');
  expect(recovery.html).toContain('Elegir una contraseña nueva');

  await page.goto(linkIn(recovery));
  await expect(page.getByText(`Para la cuenta «${USER.username}».`)).toBeVisible();
  await page.getByLabel('Nueva contraseña', { exact: true }).fill(RECOVERED);
  await page.getByLabel('Repite la nueva contraseña').fill(RECOVERED);
  await page.getByRole('button', { name: 'Guardar contraseña' }).click();
  await expect(page.getByRole('status')).toContainText('tu contraseña cambió');
  await emailTo(ADDRESS, 'Tu contraseña de DepAdmin cambió');

  // The link worked once: opened again, as from the email, it no longer does.
  await page.goto('about:blank');
  await page.goto(linkIn(recovery));
  await expect(page.getByText(/Este enlace ya no sirve/)).toBeVisible();

  await page.goto('/login');
  await signIn(page, USER.username, RECOVERED);
  await expect(page.getByRole('heading', { name: `Hola, ${USER.username}` })).toBeVisible();
});

test('the superadmin captures a neighbour’s email, and the link goes to it', async ({ page }) => {
  await page.goto('/admin/users');
  await signIn(page, SUPERADMIN.username, SUPERADMIN.password);

  const row = page.getByRole('listitem').filter({ hasText: 'Depto 502' });
  await row.getByRole('button', { name: 'Correo' }).click();
  await page.getByLabel('Correo', { exact: true }).fill('Vecino.502@depadmin.test');
  await page.getByRole('button', { name: 'Guardar y enviar el enlace' }).click();
  await expect(row).toContainText('correo sin confirmar');

  const confirmation = await emailTo('vecino.502@depadmin.test', 'Confirma tu correo en DepAdmin');
  expect(confirmation.text).toContain('la cuenta «502»');
});
