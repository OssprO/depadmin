import { expect, test } from '@playwright/test';
import { SUPERADMIN } from '../support/accounts.js';

/** The current month in the building, as "YYYY-MM": the suite runs on any date. */
function buildingMonth(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' })
    .format(new Date())
    .slice(0, 7);
}

test('starts the books, opens the month and records a payment, garbage and cleaning', async ({
  page,
}) => {
  await page.goto('/book');
  await page.getByLabel('Usuario').fill(SUPERADMIN.username);
  await page.getByLabel('Contraseña').fill(SUPERADMIN.password);
  await page.getByRole('button', { name: 'Entrar' }).click();

  await expect(page.getByText('La contabilidad aún no empieza')).toBeVisible();
  await page.getByRole('link', { name: 'Capturar el inicio' }).click();
  await page.getByLabel('Primer mes').fill(buildingMonth());
  await page.getByLabel('Efectivo en caja al empezar ($)').fill('5000');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('status')).toHaveText('Guardado.');

  await page.getByRole('link', { name: 'Libro' }).click();
  await page.getByRole('button', { name: 'Abrir el mes' }).click();
  await expect(page.getByText('Saldo actual')).toBeVisible();

  // Every active depto owes this month's fee, so the first one offered owes $700.
  await page.getByRole('button', { name: /Agregar/ }).click();
  await page.getByLabel('Depto', { exact: true }).selectOption({ index: 1 });
  const chosen =
    (await page.getByLabel('Depto', { exact: true }).locator('option:checked').textContent()) ?? '';
  const unit = /Depto (\d{3})/.exec(chosen)?.[1] ?? '';
  await expect(page.getByLabel('Importe ($)')).toHaveValue('700');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();

  const row = page.getByRole('button', { name: new RegExp(`Pago Depto ${unit}`) });
  await expect(row).toContainText(/cubre/);
  await expect(page.getByText('Saldo actual').locator('..')).toContainText('$5,700.00');

  // The month's first garbage week has always begun by the 1st, so one is pending.
  const pending = page.getByRole('region', { name: 'Basura por confirmar' });
  await pending
    .getByRole('button', { name: /^Confirmar semana/ })
    .first()
    .click();
  await expect(page.getByText('Saldo actual').locator('..')).toContainText('$5,550.00');

  // Mark today's cleaning visit on the calendar.
  await page.getByRole('button', { name: /Marcar visitas/ }).click();
  await page.locator('button[aria-pressed="false"]:not([disabled])').last().click();
  await page.getByRole('button', { name: 'Registrar 1 visita · $270.00' }).click();
  await expect(page.getByRole('region', { name: 'Limpieza por semana' })).toContainText('1 visita');
  await expect(page.getByText('Saldo actual').locator('..')).toContainText('$5,280.00');

  await page.getByRole('link', { name: 'Más' }).click();
  await page.getByRole('link', { name: /Estados de cuenta/ }).click();
  await expect(page.getByRole('link', { name: new RegExp(`Depto ${unit}`) })).toContainText(
    'al corriente',
  );
});
