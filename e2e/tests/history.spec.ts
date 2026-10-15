import { readFile } from 'node:fs/promises';
import { AxeBuilder } from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { API_PORT, SUPERADMIN, WEB_PORT } from '../support/accounts.js';
import { startStack } from '../support/stack.js';

// The building's history (ADR-0023): the superadmin starts the books with the transcription
// of the paper sheets, then checks a month against its paper in the book and corrects it.
// The history comes in only before the books start, and the other specs start them, so this
// one runs on a stack of its own.

const ports = { apiPort: API_PORT + 10, webPort: WEB_PORT + 10 };
let stopStack: (() => Promise<void>) | undefined;

test.use({ baseURL: `http://localhost:${ports.webPort}` });

test.beforeAll(async () => {
  // Within a hook, this is the hook's own timeout.
  test.setTimeout(180_000);
  stopStack = await startStack(ports);
});

test.afterAll(async () => {
  test.setTimeout(60_000);
  await stopStack?.();
});

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

const line = (unit: number, text: string, split: object = {}) => ({
  unit,
  ownerName: null,
  current: null,
  other: null,
  text,
  ...split,
});

const file = {
  version: 2,
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
          lines: [
            line(101, '', { ownerName: 'DUEÑA DE ENTONCES' }),
            line(301, 'PAGÓ EN JULIO 2022'),
          ],
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
  rates: ['maintenanceFee', 'cleaningPerVisit', 'garbageWeekly', 'shiftSkipPenalty'].map(
    (rate) => ({ rate, effectiveFrom: '2022-05-01', amount: 60000 }),
  ),
};

test('the superadmin starts the books with the history and checks a month against its paper', async ({
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
  await expect(page.getByText('Meses revisados (cerrados)')).toBeVisible();
  await expectAccessible(page, 'historial');

  // The month opens in the book, with its paper beside it.
  await page.getByRole('link', { name: /^mayo/i }).click();
  await expect(page).toHaveURL(/\/book\/2022-05$/);
  await expect(page.getByRole('heading', { name: 'Hoja de papel' })).toBeVisible();
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

  // Its sheet is corrected in place, a line per depto.
  await page.getByRole('button', { name: 'Corregir' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expectAccessible(page, 'corregir hoja');
  await page.locator('#sheet-302-text').fill('PAGÓ EN JUNIO 2022');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByText('PAGÓ EN JUNIO 2022')).toBeVisible();

  // Its report prints as the paper reads.
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar PDF' }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe('reporte-2022-05.pdf');
  expect((await readFile(await download.path())).subarray(0, 5).toString()).toBe('%PDF-');

  await page.emulateMedia({ colorScheme: 'dark' });
  await page.reload();
  await expect(page.getByText('FABULOSO 1LT')).toBeVisible();
  await expectAccessible(page, 'mes del historial (oscuro)');
  await page.goto('/admin/history');
  await expect(page.getByText('Meses revisados (cerrados)')).toBeVisible();
  await expectAccessible(page, 'historial (oscuro)');
  await page.emulateMedia({ colorScheme: 'light' });
});
