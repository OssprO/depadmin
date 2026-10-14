import { expect, type Page, test } from '@playwright/test';
import { SUPERADMIN } from '../support/accounts.js';

async function signIn(page: Page, username: string, password: string) {
  await page.getByLabel('Usuario').fill(username);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

async function signOut(page: Page) {
  await page.getByRole('link', { name: 'Cuenta' }).click();
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
}

test('signs in, keeps the session across a reload and signs out', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);

  await signIn(page, SUPERADMIN.username, SUPERADMIN.password);
  await expect(page.getByRole('heading', { name: 'Hola, admin' })).toBeVisible();

  // The access token lives only in memory: the reload resumes from the refresh cookie.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Hola, admin' })).toBeVisible();
  const cookies = await page.context().cookies();
  expect(cookies.find((c) => c.name === 'depadmin_refresh')).toMatchObject({
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
    path: '/api/auth',
  });

  await signOut(page);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
});

test('rejects a wrong password', async ({ page }) => {
  await page.goto('/login');
  await signIn(page, SUPERADMIN.username, 'not the password');

  await expect(page.getByText('Usuario o contraseña incorrectos.')).toBeVisible();
});

test('gives an owner access with a temporary password they must replace', async ({ page }) => {
  await page.goto('/admin/users');
  await signIn(page, SUPERADMIN.username, SUPERADMIN.password);

  const row = page.getByRole('listitem').filter({ hasText: 'Depto 501' });
  await row.getByRole('button', { name: 'Dar acceso' }).click();
  await page.getByRole('button', { name: 'Generar contraseña' }).click();
  const temporaryPassword = (await page.getByTestId('temporary-password').textContent())!.trim();
  await page.getByRole('button', { name: 'Listo' }).click();
  await expect(row.getByText('Temporal')).toBeVisible();
  await signOut(page);

  await signIn(page, '501', temporaryPassword);
  await expect(page.getByRole('heading', { name: 'Elige tu contraseña' })).toBeVisible();
  await page.getByLabel('Contraseña temporal').fill(temporaryPassword);
  await page.getByLabel('Nueva contraseña', { exact: true }).fill('la casa del 501');
  await page.getByLabel('Repite la nueva contraseña').fill('la casa del 501');
  await page.getByRole('button', { name: 'Guardar contraseña' }).click();

  await expect(page.getByRole('heading', { name: 'Hola, Depto 501' })).toBeVisible();
  // Owners have no user management.
  await expect(page.getByRole('link', { name: 'Usuarios' })).toHaveCount(0);
  await page.goto('/admin/users');
  await expect(page.getByRole('heading', { name: 'Hola, Depto 501' })).toBeVisible();

  // Both changes are in the audit log, which owners can read too, with no password in it.
  await page.getByRole('link', { name: 'Bitácora' }).click();
  const changed = page.getByRole('listitem').filter({ hasText: 'Contraseña cambiada' });
  const reset = page.getByRole('listitem').filter({ hasText: 'Contraseña temporal generada' });
  await expect(changed).toContainText('Depto 501 · Usuario 501');
  await expect(reset).toContainText('Superadmin · Usuario 501');
  await expect(page.locator('main')).not.toContainText(temporaryPassword);

  await page.getByLabel('Quién').selectOption('Superadmin');
  await expect(page).toHaveURL(/actor=superadmin/);
  await expect(changed).toHaveCount(0);
  await expect(reset).toBeVisible();
});
