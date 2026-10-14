import { readFile } from 'node:fs/promises';
import { expect, type Page, test } from '@playwright/test';
import { SUPERADMIN } from '../support/accounts.js';

/** The current month in the building, as "YYYY-MM": the suite runs on any date. */
function buildingMonth(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' })
    .format(new Date())
    .slice(0, 7);
}

/** The month before `month`, as "YYYY-MM". */
function previousMonth(month: string): string {
  const [year = 0, number = 0] = month.split('-').map(Number);
  return number === 1 ? `${year - 1}-12` : `${year}-${String(number - 1).padStart(2, '0')}`;
}

const balance = (page: Page) => page.getByText(/^Saldo (actual|final)$/).locator('..');

test('keeps last month’s books, closes them, downloads the PDF and shows the history and the dashboard', async ({
  page,
}) => {
  await page.goto('/book');
  await page.getByLabel('Usuario').fill(SUPERADMIN.username);
  await page.getByLabel('Contraseña').fill(SUPERADMIN.password);
  await page.getByRole('button', { name: 'Entrar' }).click();

  // The books start last month, which is over: every one of its weeks has begun.
  const lastMonth = previousMonth(buildingMonth());
  await expect(page.getByText('La contabilidad aún no empieza')).toBeVisible();
  await page.getByRole('link', { name: 'Capturar el inicio' }).click();
  await page.getByLabel('Primer mes').fill(lastMonth);
  await page.getByLabel('Efectivo en caja al empezar ($)').fill('5000');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('status')).toHaveText('Guardado.');

  // Opening this month opens last month first.
  await page.getByRole('link', { name: 'Libro' }).click();
  await page.getByRole('button', { name: 'Abrir el mes' }).click();
  await expect(page.getByText('Saldo actual')).toBeVisible();
  await page.getByLabel('Mes anterior').click();
  await expect(balance(page)).toContainText('$5,000.00');

  // Every active depto owes last month's fee, so the first one offered owes $700.
  await page.getByRole('button', { name: /Agregar/ }).click();
  await page.getByLabel('Depto', { exact: true }).selectOption({ index: 1 });
  const chosen =
    (await page.getByLabel('Depto', { exact: true }).locator('option:checked').textContent()) ?? '';
  const unit = /Depto (\d{3})/.exec(chosen)?.[1] ?? '';
  await expect(page.getByLabel('Importe ($)')).toHaveValue('700');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByRole('button', { name: new RegExp(`Pago Depto ${unit}`) })).toContainText(
    /cubre/,
  );
  await expect(balance(page)).toContainText('$5,700.00');

  const pending = page.getByRole('region', { name: 'Basura por confirmar' });
  await pending
    .getByRole('button', { name: /^Confirmar semana/ })
    .first()
    .click();
  await expect(balance(page)).toContainText('$5,550.00');

  // Mark a cleaning visit on the calendar: the month is over, so any day can be picked.
  await page.getByRole('button', { name: /Marcar visitas/ }).click();
  await page.locator('button[aria-pressed="false"]:not([disabled])').last().click();
  await page.getByRole('button', { name: 'Registrar 1 visita · $270.00' }).click();
  await expect(page.getByRole('region', { name: 'Limpieza por semana' })).toContainText('1 visita');
  await expect(balance(page)).toContainText('$5,280.00');

  // Close it: the other garbage weeks are still unpaid, and the dialog says so.
  await page
    .getByRole('region', { name: 'Cierre del mes' })
    .getByRole('button', { name: 'Cerrar el mes' })
    .click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText(/semanas? de basura sin registrar/);
  await dialog.getByRole('button', { name: 'Cerrar el mes' }).click();
  await expect(page.getByText('Cerrado', { exact: true })).toBeVisible();
  await expect(balance(page)).toContainText('Saldo final$5,280.00');
  await expect(page.getByRole('button', { name: 'Reabrir el mes' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Agregar/ })).toHaveCount(0);

  // Its report as a PDF, built from the frozen month.
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar PDF' }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe(`reporte-${lastMonth}.pdf`);
  const pdf = await readFile(await download.path());
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');

  await page.getByRole('link', { name: 'Todos los meses' }).click();
  const months = page.getByRole('listitem');
  await expect(months.first()).toContainText('Abierto');
  await expect(months.first()).toContainText('$5,280.00saldo actual');
  await expect(months.nth(1)).toContainText('Cerrado');
  await expect(months.nth(1)).toContainText('$5,280.00saldo final');

  await page.getByRole('link', { name: 'Inicio' }).click();
  await expect(page.getByRole('region', { name: 'Caja' })).toContainText('$5,280.00');
  // It paid last month; this month's fee is still due.
  await expect(page.getByRole('region', { name: 'Deptos con adeudo' })).toContainText(
    `Depto ${unit}debe $700.00`,
  );
});
