import { expect, test } from '@playwright/test';
import { SUPERADMIN } from '../support/accounts.js';

// The same app in three sizes (projects mobile-chrome, tablet and desktop): a bottom bar on
// the phone, a side menu from a tablet up with the state of the system at its foot, the
// home in two columns from a tablet up and the book in two on a desktop. Each column stacks
// on its own, with no gaps from the other. It runs after books.spec, so the current month
// has rows.

type Box = { x: number; y: number; width: number; height: number };
const bottom = (box: Box) => box.y + box.height;
const right = (box: Box) => box.x + box.width;
const overlap = (a: Box, b: Box) =>
  a.x < right(b) && b.x < right(a) && a.y < bottom(b) && b.y < bottom(a);

test('adapts the menu, the book and the forms to the size of the screen', async ({
  page,
}, testInfo) => {
  const project = testInfo.project.name;
  await page.goto('/login');
  await page.getByLabel('Usuario').fill(SUPERADMIN.username);
  await page.getByLabel('Contraseña').fill(SUPERADMIN.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  const cash = page.getByRole('region', { name: 'Caja' });
  const owing = page.getByRole('region', { name: 'Deptos con adeudo' });
  const shift = page
    .getByText('Turno actual', { exact: true })
    .locator('xpath=ancestor::*[@data-slot="card"][1]');
  await expect(cash).toBeVisible();
  await expect(owing).toBeVisible();
  const [cashBox, owingBox, shiftBox] = [
    (await cash.boundingBox())!,
    (await owing.boundingBox())!,
    (await shift.boundingBox())!,
  ];
  if (project === 'mobile-chrome') {
    expect(shiftBox.y).toBeGreaterThan(bottom(cashBox));
    expect(owingBox.y).toBeGreaterThan(bottom(shiftBox));
  } else {
    // The shift on the left, the cash on the right, and its debts right below it.
    expect(cashBox.x).toBeGreaterThan(right(shiftBox));
    expect(cashBox.y).toBeCloseTo(shiftBox.y, -1);
    expect(owingBox.x).toBeCloseTo(cashBox.x, 0);
    expect(owingBox.y - bottom(cashBox)).toBeLessThan(32);
  }

  const menu = page.getByRole('navigation', { name: 'Principal' });
  await expect(menu).toHaveCount(1);
  const status = page.getByRole('region', { name: 'Estado del sistema' });
  if (project === 'mobile-chrome') {
    await expect(menu.getByRole('link', { name: 'Más' })).toBeVisible();
    await expect(status).toHaveCount(0);
    await menu.getByRole('link', { name: 'Más' }).click();
    await expect(status.getByText('En línea')).toBeVisible();
  } else {
    // At the foot of the side menu.
    await expect(
      page.getByRole('complementary').locator(status).getByText('En línea'),
    ).toBeVisible();
    await expect(menu.getByRole('link', { name: 'Estados de cuenta' })).toBeVisible();
    await expect(menu.getByRole('link', { name: 'Más' })).toHaveCount(0);
    // Its sections open from the menu, with nothing to go back to.
    await menu.getByRole('link', { name: 'Estados de cuenta' }).click();
    await expect(page.getByText('Depto 101')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Atrás' })).toBeHidden();
  }

  // Who is signed in, on every screen (phase 37): beside the name on the phone, with just
  // the circle, and under it in the side menu, with the account and its role.
  const badge = page.getByRole('link', { name: 'Cuenta: admin, superadmin' });
  const building = page.getByText('Edificio Correspondencia 63').filter({ visible: true });
  await expect(badge).toHaveCount(1);
  const [badgeBox, buildingBox] = [(await badge.boundingBox())!, (await building.boundingBox())!];
  if (project === 'mobile-chrome') {
    // Just the circle, with the wrench of «Administración».
    await expect(badge.locator('[data-slot="account-circle"] svg')).toBeVisible();
    expect(badgeBox.width).toBeLessThanOrEqual(48);
    expect(badgeBox.x).toBeGreaterThanOrEqual(right(buildingBox));
    // On a narrow phone too.
    const size = page.viewportSize()!;
    await page.setViewportSize({ width: 360, height: size.height });
    const narrow = [(await badge.boundingBox())!, (await building.boundingBox())!] as const;
    expect(overlap(...narrow)).toBe(false);
    expect(right(narrow[0])).toBeLessThanOrEqual(360);
    await page.setViewportSize(size);
  } else {
    const side = page.getByRole('complementary').locator(badge);
    await expect(side.getByText('admin', { exact: true })).toBeVisible();
    await expect(side.getByText('Superadmin', { exact: true })).toBeVisible();
    expect(badgeBox.y).toBeGreaterThanOrEqual(bottom(buildingBox));
  }
  await badge.click();
  await expect(page.getByRole('heading', { name: 'Mi cuenta' })).toBeVisible();

  await page.goto('/book');
  const month = page.getByRole('region', { name: 'El mes' });
  const rows = page.getByRole('region', { name: 'Movimientos' });
  const closing = page.getByRole('region', { name: 'Limpieza y cierre' });
  await expect(rows).toBeVisible();
  const [monthBox, rowsBox, closingBox] = [
    (await month.boundingBox())!,
    (await rows.boundingBox())!,
    (await closing.boundingBox())!,
  ];
  if (project === 'desktop') {
    // Side by side: the rows on the left; the month on the right, its cleaning right below.
    expect(monthBox.x).toBeGreaterThan(right(rowsBox));
    expect(rowsBox.y).toBeCloseTo(monthBox.y, -1);
    expect(closingBox.x).toBeCloseTo(monthBox.x, 0);
    expect(closingBox.y - bottom(monthBox)).toBeLessThan(32);
  } else {
    expect(rowsBox.y).toBeGreaterThan(bottom(monthBox));
    expect(closingBox.y).toBeGreaterThan(bottom(rowsBox));
  }

  // The form comes up from the bottom on the phone and as a panel on the right elsewhere.
  await page.getByRole('button', { name: 'Agregar', exact: true }).click();
  const form = page.getByRole('dialog');
  await expect(form).toBeVisible();
  await expect(form).toHaveAttribute('data-side', project === 'mobile-chrome' ? 'bottom' : 'right');

  // The cash counter: bills and coins side by side on a desktop, one under the other elsewhere.
  await page.goto('/tools/cash');
  await expect(page.getByLabel('Billetes de $1,000')).toBeVisible();
  const [bills, coins] = await Promise.all(
    ['Billetes', 'Monedas'].map((name) =>
      page
        .getByRole('heading', { name, exact: true })
        .locator('xpath=ancestor::*[@data-slot="card"][1]')
        .boundingBox(),
    ),
  );
  if (project === 'desktop') expect(coins!.x).toBeGreaterThan(bills!.x + bills!.width);
  else expect(coins!.y).toBeGreaterThan(bills!.y + bills!.height);
});
