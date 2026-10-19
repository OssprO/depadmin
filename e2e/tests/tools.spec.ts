import { expect, test } from '@playwright/test';
import { SUPERADMIN } from '../support/accounts.js';

// The cash counter (phase 15): a utility that adds up the bills and coins in the box. It
// asks nothing of the server, so it keeps counting with the connection gone.

test('counts the cash in the box with the numeric keyboard, even offline', async ({
  page,
  context,
}) => {
  await page.goto('/login');
  await page.getByLabel('Usuario').fill(SUPERADMIN.username);
  await page.getByLabel('Contraseña').fill(SUPERADMIN.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('region', { name: 'Caja' })).toBeVisible();

  await page
    .getByRole('navigation', { name: 'Principal' })
    .getByRole('link', { name: 'Más' })
    .click();
  await page.getByRole('link', { name: /Herramientas/ }).click();
  await page.getByRole('link', { name: /Contador de efectivo/ }).click();
  const thousands = page.getByLabel('Billetes de $1,000');
  await expect(thousands).toBeVisible();
  // The phone shows its number pad, with a key to go to the next field.
  await expect(thousands).toHaveAttribute('inputmode', 'numeric');
  await expect(thousands).toHaveAttribute('enterkeyhint', 'next');

  await context.setOffline(true);
  await thousands.fill('12');
  await thousands.press('Enter');
  await expect(page.getByLabel('Billetes de $500')).toBeFocused();
  await page.keyboard.type('3');
  await page.getByLabel('Monedas de 50¢').fill('5');
  const total = page.getByText('Total').locator('..');
  await expect(total).toContainText('$13,502.50');

  await page.getByRole('button', { name: 'Limpiar' }).click();
  await expect(total).toContainText('$0.00');
  await expect(thousands).toHaveValue('');
  await expect(thousands).toBeFocused();
  await context.setOffline(false);
});
