import { expect, type Page, test } from '@playwright/test';
import { SUPERADMIN } from '../support/accounts.js';

// Read-only users (phase 14): the superadmin creates a tenant, who sees the books and can
// change nothing; switching the tenant off ends their way in. Runs after books.spec, so the
// current month is open.

async function signIn(page: Page, username: string, password: string) {
  await page.getByLabel('Usuario').fill(username);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

async function signOut(page: Page) {
  await page.goto('/account');
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
}

test('the superadmin creates a read-only tenant, who sees the books and changes nothing', async ({
  page,
}) => {
  await page.goto('/admin/users');
  await signIn(page, SUPERADMIN.username, SUPERADMIN.password);

  await page.getByRole('button', { name: /Nuevo usuario de solo lectura/ }).click();
  await page.getByRole('textbox', { name: 'Usuario', exact: true }).fill('inquilino.302');
  await page.getByLabel('Depto').selectOption('Depto 302');
  await page.getByRole('button', { name: 'Crear usuario' }).click();
  const temporaryPassword = (await page.getByTestId('temporary-password').textContent())!.trim();
  await page.getByRole('button', { name: 'Listo' }).click();
  const row = page.getByRole('listitem').filter({ hasText: 'inquilino.302' });
  await expect(row).toContainText('Solo lectura · Depto 302');
  await signOut(page);

  await signIn(page, 'inquilino.302', temporaryPassword);
  await page.getByLabel('Contraseña temporal').fill(temporaryPassword);
  await page.getByLabel('Nueva contraseña', { exact: true }).fill('el depto 302 renta');
  await page.getByLabel('Repite la nueva contraseña').fill('el depto 302 renta');
  await page.getByRole('button', { name: 'Guardar contraseña' }).click();
  await expect(page.getByRole('heading', { name: 'Hola, inquilino.302' })).toBeVisible();

  // The book in full, with nothing to add or change.
  await page.goto('/book');
  await expect(page.getByText(/Saldo (actual|final|inicial)/).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Agregar', exact: true })).toHaveCount(0);
  await expect(page.getByText(/^Solo lectura/)).toBeVisible();
  await signOut(page);

  // Switched off, the tenant cannot get back in.
  await signIn(page, SUPERADMIN.username, SUPERADMIN.password);
  await expect(page).not.toHaveURL(/login/);
  await page.goto('/admin/users');
  await row.getByRole('button', { name: 'Acceso' }).click();
  await page.getByRole('button', { name: /Desactivar/ }).click();
  await expect(row.getByText('Desactivado')).toBeVisible();
  await signOut(page);
  await signIn(page, 'inquilino.302', 'el depto 302 renta');
  await expect(page.getByText(/Tu acceso está desactivado/)).toBeVisible();
});
