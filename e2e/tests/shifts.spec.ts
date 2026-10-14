import { expect, test } from '@playwright/test';
import { SUPERADMIN } from '../support/accounts.js';

// Written against whatever month the suite runs in: it only relies on there being a
// current period, which the dashboard and the calendar both show.

test('the superadmin delegates the current shift and cancels it', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Usuario').fill(SUPERADMIN.username);
  await page.getByLabel('Contraseña').fill(SUPERADMIN.password);
  await page.getByRole('button', { name: 'Entrar' }).click();

  // The dashboard draws the building with the current holder highlighted.
  const building = page.getByRole('list', { name: 'Edificio' });
  await expect(building.getByRole('listitem')).toHaveCount(10);
  await expect(building.getByRole('listitem', { name: /En turno/ })).toHaveCount(1);

  await page.getByRole('link', { name: 'Turnos' }).click();
  const current = page.getByRole('region').filter({ hasText: 'Actual' });
  await current.getByRole('button', { name: 'Delegar' }).click();
  await page.getByLabel('Quién lo cubre').selectOption({ index: 1 });
  await page.getByLabel('Motivo').selectOption({ label: 'Otro acuerdo' });
  await page.getByRole('button', { name: 'Guardar' }).click();

  await expect(current).toContainText(/Depto \d{3} cubre a Depto \d{3} \(otro acuerdo\)/);
  await page.getByRole('link', { name: 'Inicio' }).click();
  await expect(building.getByRole('listitem', { name: /Cubre/ })).toHaveCount(1);
  await page.getByRole('link', { name: 'Bitácora' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Turno delegado' })).toBeVisible();

  await page.getByRole('link', { name: 'Turnos' }).click();
  await current.getByRole('button', { name: 'Cancelar' }).click();
  await page.getByRole('button', { name: 'Sí, cancelar' }).click();
  await expect(current).not.toContainText('cubre a');
});
