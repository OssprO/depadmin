import { AxeBuilder } from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { SUPERADMIN } from '../support/accounts.js';

// Every main screen against the WCAG 2.1 A and AA rules that axe can check automatically
// (contrast, names, landmarks, ARIA). It runs after books.spec, so the screens have data.

async function expectAccessible(page: Page, screen: string) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const found = violations.map(
    (v) => `${screen}: ${v.id} (${v.impact}) ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
  );
  expect(found).toEqual([]);
}

test('every main screen meets WCAG 2.1 AA as far as axe can tell', async ({ page }) => {
  // Two passes (light and dark) over a dozen screens.
  test.setTimeout(120_000);
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
  await expectAccessible(page, 'login');

  await page.getByLabel('Usuario').fill(SUPERADMIN.username);
  await page.getByLabel('Contraseña').fill(SUPERADMIN.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('region', { name: 'Caja' })).toBeVisible();
  await expectAccessible(page, 'inicio');

  type Screen = [path: string, name: string, ready: (page: Page) => Promise<void>];
  const screens: Screen[] = [
    [
      '/book',
      'libro',
      (p) => expect(p.getByText(/Saldo (actual|final|inicial)/).first()).toBeVisible(),
    ],
    ['/history', 'histórico', (p) => expect(p.getByRole('listitem').first()).toBeVisible()],
    ['/shifts', 'turnos', (p) => expect(p.getByRole('heading', { level: 1 })).toBeVisible()],
    [
      '/audit',
      'bitácora',
      (p) => expect(p.getByRole('heading', { name: 'Bitácora' })).toBeVisible(),
    ],
    ['/more', 'más', (p) => expect(p.getByRole('heading', { name: 'Más' })).toBeVisible()],
    ['/accounts', 'cuentas', (p) => expect(p.getByText('Depto 101')).toBeVisible()],
    [
      '/accounts/101',
      'estado de cuenta',
      (p) => expect(p.getByRole('heading', { name: 'Depto 101' })).toBeVisible(),
    ],
    ['/admin/users', 'usuarios', (p) => expect(p.getByText('501').first()).toBeVisible()],
    ['/admin/units', 'deptos', (p) => expect(p.getByText('Depto 101')).toBeVisible()],
    [
      '/admin/start',
      'inicio de la contabilidad',
      (p) => expect(p.getByLabel('Primer mes')).toBeVisible(),
    ],
    ['/admin/opening', 'carga inicial', (p) => expect(p.getByText('Depto 101')).toBeVisible()],
  ];
  for (const [path, screen, ready] of screens) {
    await page.goto(path);
    await ready(page);
    await expectAccessible(page, screen);
  }

  // The same screens with the phone in dark mode, which has its own colors.
  await page.emulateMedia({ colorScheme: 'dark' });
  for (const [path, screen, ready] of screens) {
    await page.goto(path);
    await ready(page);
    await expectAccessible(page, `${screen} (oscuro)`);
  }
  await page.emulateMedia({ colorScheme: 'light' });

  // A sheet over the book: the form to add a row.
  await page.goto('/book');
  await page.getByRole('button', { name: /Agregar/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expectAccessible(page, 'agregar movimiento');
});
