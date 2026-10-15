import { AxeBuilder } from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { SUPERADMIN } from '../support/accounts.js';

// The building's history (ADR-0022): the superadmin imports the transcription of the paper
// sheets, checks a month against its paper and corrects it. It runs after books.spec, whose
// books start last month; this history ends years before that.

async function expectAccessible(page: Page, screen: string) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(
    violations.map((v) => `${screen}: ${v.id} ${v.nodes.map((n) => n.target).join(', ')}`),
  ).toEqual([]);
}

const row = (date: string, category: string, amount: number, extra: object = {}) => ({
  date,
  category,
  amount,
  unit: null,
  description: null,
  week: null,
  ...extra,
});

const file = {
  version: 1,
  openingBalance: 71225,
  months: [
    {
      month: '2022-05',
      sheets: [
        {
          fromDay: 1,
          source: 'PDF MAY-JUL 2022 p1',
          opening: 71225,
          income: 120000,
          expense: 15000,
          closing: 176225,
          alerts: ['Cuota de $600 más $100 de administración fuera de la caja'],
          notes: [{ unit: 301, text: 'PAGÓ EN JULIO 2022' }],
        },
      ],
      movements: [
        row('2022-05-01', 'UNIT_PAYMENT', 60000, { unit: 101 }),
        row('2022-05-01', 'UNIT_PAYMENT', 60000, { unit: 102 }),
        row('2022-05-14', 'GARBAGE', 15000, { week: '2022-05-09' }),
      ],
    },
    { month: '2022-06', sheets: [], movements: [] },
  ],
  owners: [],
};

test('the superadmin imports the history and checks a month against its paper', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto('/login');
  await page.getByLabel('Usuario').fill(SUPERADMIN.username);
  await page.getByLabel('Contraseña').fill(SUPERADMIN.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).not.toHaveURL(/login/);

  await page.goto('/admin');
  await page.getByRole('link', { name: /Historial/ }).click();
  await expect(page.getByText('Importar el historial')).toBeVisible();
  await expectAccessible(page, 'importar historial');
  await page.getByLabel('Archivo').setInputFiles({
    name: 'historial.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(file)),
  });
  await expect(page.getByText('mayo 2022 a junio 2022 (2)')).toBeVisible();
  await page.getByRole('button', { name: 'Importar' }).click();
  await expect(page.getByText('En revisión', { exact: true })).toBeVisible();
  await expectAccessible(page, 'historial');

  await page.getByRole('link', { name: /^mayo/i }).click();
  await expect(page.getByText('PAGÓ EN JULIO 2022')).toBeVisible();
  await expect(page.getByText('Cuadra')).toBeVisible();
  // Income and expense side by side: the rows added up, then the paper.
  await expect(page.getByRole('row', { name: /^Ingresos/ }).getByRole('cell')).toHaveText([
    '+ $1,200.00',
    '+ $1,200.00',
  ]);
  await expect(page.getByRole('row', { name: /^Egresos/ }).getByRole('cell')).toHaveText([
    '− $150.00',
    '− $150.00',
  ]);
  await expectAccessible(page, 'mes del historial');

  // A row is missing on purpose: adding it makes the month disagree with its paper.
  await page.getByRole('button', { name: 'Agregar', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expectAccessible(page, 'agregar al historial');
  await page.getByText('Otro egreso').click();
  await page.getByLabel('Importe ($)').fill('26');
  await page.getByLabel('Descripción').fill('FABULOSO 1LT');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByText('Faltan $26.00')).toBeVisible();

  await page.emulateMedia({ colorScheme: 'dark' });
  await page.reload();
  await expect(page.getByText('FABULOSO 1LT')).toBeVisible();
  await expectAccessible(page, 'mes del historial (oscuro)');
  await page.goto('/admin/history');
  await expect(page.getByText('En revisión', { exact: true })).toBeVisible();
  await expectAccessible(page, 'historial (oscuro)');
  await page.emulateMedia({ colorScheme: 'light' });
});
