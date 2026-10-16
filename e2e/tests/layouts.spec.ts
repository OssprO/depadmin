import { expect, test } from '@playwright/test';
import { SUPERADMIN } from '../support/accounts.js';

// The same app in three sizes (projects mobile-chrome, tablet and desktop): a bottom bar on
// the phone, a side menu from a tablet up, and the book in two columns on a desktop. It
// runs after books.spec, so the current month has rows.

test('adapts the menu, the book and the forms to the size of the screen', async ({
  page,
}, testInfo) => {
  const project = testInfo.project.name;
  await page.goto('/login');
  await page.getByLabel('Usuario').fill(SUPERADMIN.username);
  await page.getByLabel('Contraseña').fill(SUPERADMIN.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('region', { name: 'Caja' })).toBeVisible();

  const menu = page.getByRole('navigation', { name: 'Principal' });
  await expect(menu).toHaveCount(1);
  if (project === 'mobile-chrome') {
    await expect(menu.getByRole('link', { name: 'Más' })).toBeVisible();
  } else {
    await expect(menu.getByRole('link', { name: 'Estados de cuenta' })).toBeVisible();
    await expect(menu.getByRole('link', { name: 'Más' })).toHaveCount(0);
    // Its sections open from the menu, with nothing to go back to.
    await menu.getByRole('link', { name: 'Estados de cuenta' }).click();
    await expect(page.getByText('Depto 101')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Atrás' })).toBeHidden();
  }

  await page.goto('/book');
  const month = page.getByRole('region', { name: 'El mes' });
  const rows = page.getByRole('region', { name: 'Movimientos' });
  await expect(rows).toBeVisible();
  const [monthBox, rowsBox] = [await month.boundingBox(), await rows.boundingBox()];
  if (project === 'desktop') {
    // Side by side: the month on the left, its rows on the right.
    expect(rowsBox!.x).toBeGreaterThan(monthBox!.x + monthBox!.width);
    expect(rowsBox!.y).toBeCloseTo(monthBox!.y, -1);
  } else {
    expect(rowsBox!.y).toBeGreaterThan(monthBox!.y + monthBox!.height);
  }

  // The form comes up from the bottom on the phone and as a panel on the right elsewhere.
  await page.getByRole('button', { name: 'Agregar', exact: true }).click();
  const form = page.getByRole('dialog');
  await expect(form).toBeVisible();
  await expect(form).toHaveAttribute('data-side', project === 'mobile-chrome' ? 'bottom' : 'right');
});
