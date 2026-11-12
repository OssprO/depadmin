import { readdir, rm } from 'node:fs/promises';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type APIRequestContext, expect, type Locator, type Page, test } from '@playwright/test';
import { BASE_URL, SUPERADMIN } from '../support/accounts.js';

// Takes the guide's screenshots and prints it to a PDF (frontend/src/features/help/).
// It walks each step with the button names the guide quotes, so a renamed button fails
// here instead of leaving the guide wrong.
//
// Written against whatever month it runs in. The books start last month, which is over, so
// every one of its days can be recorded and it can be closed. The steps that write go
// through the superadmin, who can always write it; their screenshots are cropped to the
// card or form, which owners see the same. The rest is depto 401, as an owner sees it.

const HELP = fileURLToPath(new URL('../../frontend/public/help/', import.meta.url));
const PDF = fileURLToPath(new URL('../../frontend/public/guia-depadmin.pdf', import.meta.url));
const OWNER = { username: '401', password: 'la casa del 401' };

test.describe.configure({ mode: 'serial' });

/** The current month in the building, as "YYYY-MM". */
function buildingMonth(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' })
    .format(new Date())
    .slice(0, 7);
}

function previousMonth(month: string): string {
  const [year = 0, number = 0] = month.split('-').map(Number);
  return number === 1 ? `${year - 1}-12` : `${year}-${String(number - 1).padStart(2, '0')}`;
}

const pesos = (amount: number) => Math.round(amount * 100);

/** What floats over the page on the phone: the bottom bar and the book's «Agregar». */
const FLOATING = 'nav[aria-label="Principal"], button[aria-keyshortcuts="N"]';

/**
 * Saves a screenshot for the guide: the whole phone screen, or one card or form of it, which
 * what floats over the page must not cover.
 */
async function shoot(target: Page | Locator, name: string): Promise<void> {
  await target.screenshot({
    path: `${HELP}${name}.png`,
    animations: 'disabled',
    caret: 'hide',
    ...('page' in target && { style: `${FLOATING} { visibility: hidden; }` }),
  });
}

/** The superadmin's API, to set up a building with a few months of life. */
async function adminApi(request: APIRequestContext) {
  const login = await request.post('/api/auth/login', { data: SUPERADMIN });
  expect(login.ok()).toBe(true);
  const { accessToken } = (await login.json()) as { accessToken: string };
  const headers = { Authorization: `Bearer ${accessToken}` };
  const send = async (method: 'POST' | 'PUT', url: string, data?: unknown) => {
    const response = await request.fetch(url, { method, headers, data });
    const body = await response.text();
    expect(response.ok(), `${method} ${url}: ${body}`).toBe(true);
    return (body ? JSON.parse(body) : null) as unknown;
  };
  return {
    send,
    get: async (url: string) => (await request.get(url, { headers })).json() as Promise<unknown>,
    movement: (row: {
      date: string;
      category: 'UNIT_PAYMENT' | 'OTHER_INCOME' | 'CLEANING' | 'OTHER_EXPENSE';
      amount: number;
      unit?: number;
      description?: string;
    }) =>
      send('POST', '/api/movements', {
        unit: null,
        description: null,
        week: null,
        ...row,
        amount: pesos(row.amount),
      }),
  };
}

test('takes the screenshots, step by step', async ({ page, request }) => {
  await rm(HELP, { recursive: true, force: true }).catch(() => undefined);
  const thisMonth = buildingMonth();
  const lastMonth = previousMonth(thisMonth);

  // A building that started last month: payments, cleaning and an expense in both months.
  const api = await adminApi(request);
  await api.send('PUT', '/api/reporting-start', {
    month: lastMonth,
    openingBalance: pesos(18247.02),
  });
  await api.send('POST', `/api/months/${thisMonth}/open`);
  for (const [day, unit] of [
    ['03', 501],
    ['04', 401],
    ['06', 302],
    ['10', 202],
    ['12', 101],
  ] as const) {
    await api.movement({
      date: `${lastMonth}-${day}`,
      category: 'UNIT_PAYMENT',
      amount: 700,
      unit,
    });
  }
  await api.movement({ date: `${lastMonth}-08`, category: 'CLEANING', amount: 270 });
  await api.movement({
    date: `${lastMonth}-15`,
    category: 'OTHER_EXPENSE',
    amount: 185,
    description: 'Focos para el pasillo',
  });
  for (const unit of [501, 402]) {
    await api.movement({ date: `${thisMonth}-01`, category: 'UNIT_PAYMENT', amount: 700, unit });
  }
  await api.movement({ date: `${thisMonth}-01`, category: 'CLEANING', amount: 270 });

  // Depto 401 gets a temporary password from the superadmin.
  const users = (await api.get('/api/users')) as { id: string; unit: number | null }[];
  const owner = users.find((user) => user.unit === 401)!;
  const { temporaryPassword } = (await api.send(
    'POST',
    `/api/users/${owner.id}/password-reset`,
  )) as { temporaryPassword: string };

  // The turn's steps, on last month, by the superadmin.
  await page.goto('/login');
  await page.getByLabel('Usuario').fill(SUPERADMIN.username);
  await page.getByLabel('Contraseña').fill(SUPERADMIN.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.getByRole('link', { name: 'Libro' }).click();
  await page.getByLabel('Mes anterior').click();
  await expect(page.getByText('Saldo actual')).toBeVisible();

  await page.getByRole('button', { name: /Agregar/ }).click();
  const form = page.getByRole('dialog');
  await form.getByText('Pago de depto').click();
  await form.getByLabel('Depto', { exact: true }).selectOption('402');
  await expect(form.getByLabel('Importe ($)')).toHaveValue('700');
  await shoot(form, 'payment');
  await form.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByRole('button', { name: /Pago Depto 402/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(form).toBeHidden();

  const garbage = page.getByRole('region', { name: 'Basura por confirmar' });
  await shoot(garbage, 'garbage');
  await garbage
    .getByRole('button', { name: /^Confirmar semana/ })
    .first()
    .click();

  await page
    .getByRole('region', { name: 'Limpieza por semana' })
    .getByRole('button', { name: 'Marcar visitas' })
    .click();
  const visits = page.getByRole('dialog');
  const days = visits.locator('button[aria-pressed="false"]:not([disabled])');
  await days.nth(10).click();
  await days.nth(13).click();
  await shoot(visits, 'cleaning');
  await visits.getByRole('button', { name: /^Registrar/ }).click();
  await expect(visits).toBeHidden();

  const closing = page.getByRole('region', { name: 'Cierre del mes' });
  await shoot(closing, 'close-month');
  await closing.getByRole('button', { name: 'Cerrar el mes' }).click();
  const confirm = page.getByRole('alertdialog');
  await expect(confirm).toContainText(/basura sin registrar/);
  await shoot(confirm, 'close-confirm');
  await confirm.getByRole('button', { name: 'Cerrar el mes' }).click();
  await expect(page.getByText('Cerrado', { exact: true })).toBeVisible();

  // The rest as depto 401, from its first sign-in.
  await page.goto('/account');
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
  const phone = page;
  await phone.getByLabel('Usuario').fill(OWNER.username);
  await phone.getByLabel('Contraseña').fill(temporaryPassword);
  await shoot(phone.locator('main [data-slot="card"]'), 'sign-in');
  await phone.getByRole('button', { name: 'Entrar' }).click();

  await expect(phone.getByRole('heading', { name: 'Elige tu contraseña' })).toBeVisible();
  await phone.getByLabel('Contraseña temporal').fill(temporaryPassword);
  await phone.getByLabel('Nueva contraseña', { exact: true }).fill(OWNER.password);
  await phone.getByLabel('Repite la nueva contraseña').fill(OWNER.password);
  await shoot(phone.locator('main'), 'choose-password');
  await phone.getByRole('button', { name: 'Guardar contraseña' }).click();

  await expect(phone.getByRole('heading', { name: 'Hola, Depto 401' })).toBeVisible();
  await expect(phone.getByRole('region', { name: 'Caja' })).toBeVisible();
  await expect(phone.getByRole('region', { name: 'Deptos con adeudo' })).toBeVisible();
  await shoot(phone, 'home');

  await phone.getByRole('link', { name: 'Más' }).click();
  await phone.getByRole('link', { name: /Mi cuenta/ }).click();
  await expect(phone.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
  await shoot(phone, 'my-account');
  await phone.getByRole('link', { name: 'Cambiar contraseña' }).click();
  await expect(phone.getByLabel('Contraseña actual')).toBeVisible();
  await shoot(phone.locator('main'), 'change-password');

  await phone.getByRole('link', { name: 'Libro' }).click();
  const month = phone.getByRole('region', { name: 'El mes' });
  await expect(month.getByText('Saldo actual')).toBeVisible();
  await shoot(month.locator('> *').first(), 'month-summary');
  await shoot(phone.getByRole('region', { name: 'Movimientos' }), 'movements');
  await shoot(phone.getByRole('button', { name: 'Descargar PDF' }).locator('..'), 'report-pdf');
  await phone.getByRole('link', { name: 'Todos los meses' }).click();
  await expect(phone.getByRole('listitem').nth(1)).toContainText('Cerrado');
  await shoot(phone, 'all-months');

  await phone.getByRole('link', { name: 'Más' }).click();
  await phone.getByRole('link', { name: /Estados de cuenta/ }).click();
  await expect(phone.getByRole('link', { name: /Depto 401 \(tú\)/ })).toBeVisible();
  await shoot(phone, 'accounts');
  await phone.getByRole('link', { name: /Depto 401 \(tú\)/ }).click();
  await expect(phone.getByRole('heading', { name: 'Depto 401' })).toBeVisible();
  await expect(phone.getByText('Cargos')).toBeVisible();
  await shoot(phone, 'statement');
});

test('prints the guide to a PDF', async ({ browser }) => {
  // A plain browser, not a phone: the page is laid out for a sheet of paper.
  const context = await browser.newContext({
    baseURL: BASE_URL,
    colorScheme: 'light',
    locale: 'es-MX',
  });
  const page = await context.newPage();
  // `vite preview` serves the build, which has the screenshots of before: the new ones.
  const taken = new Set(await readdir(HELP));
  await page.route('**/help/*.png', async (route) => {
    const name = basename(new URL(route.request().url()).pathname);
    if (taken.has(name)) await route.fulfill({ path: `${HELP}${name}` });
    else await route.fulfill({ status: 404 });
  });
  await page.emulateMedia({ media: 'print' });
  await page.goto('/help/print');
  await expect(page.getByRole('heading', { level: 1, name: 'Guía de DepAdmin' })).toBeVisible();
  await page.waitForFunction(
    () =>
      [...document.images].every((image) => image.complete && image.naturalWidth > 0) &&
      document.fonts.status === 'loaded',
  );
  await page.pdf({
    path: PDF,
    format: 'Letter',
    printBackground: true,
    margin: { top: '1.5cm', bottom: '1.5cm', left: '1.8cm', right: '1.8cm' },
  });
  await context.close();
});
