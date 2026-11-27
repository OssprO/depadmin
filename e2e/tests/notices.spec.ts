import { type APIRequestContext, expect, type Page, test } from '@playwright/test';
import { BASE_URL, SUPERADMIN } from '../support/accounts.js';
import { expectAccessible } from '../support/accessibility.js';
import { emailTo, headersOf, linkIn } from '../support/mailbox.js';

// Notices (phase 25, ADR-0034), against a real SMTP server (Mailpit): the superadmin
// publishes one (who holds the shift depends on the day the suite runs), a reader sees it new
// on the home and gets it by email, and stops the notices from the email's link. The notice
// is withdrawn at the end, so the specs after this one find the home as before. Each attempt
// has its own reader and notice: a retry in CI finds the first one's still there.

const PASSWORD = 'la contraseña de siempre';

async function accessTokenOf(request: APIRequestContext, username: string, password: string) {
  const login = await request.post('/api/auth/login', { data: { username, password } });
  expect(login.ok()).toBe(true);
  return ((await login.json()) as { accessToken: string }).accessToken;
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

/** A reader of no depto, with its password chosen and `address` confirmed. */
async function givenReader(request: APIRequestContext, username: string, address: string) {
  const admin = await accessTokenOf(request, SUPERADMIN.username, SUPERADMIN.password);
  const created = await request.post('/api/users', {
    headers: bearer(admin),
    data: { username, unit: null, expiresOn: null },
  });
  expect(created.ok()).toBe(true);
  const { temporaryPassword } = (await created.json()) as { temporaryPassword: string };
  const first = await accessTokenOf(request, username, temporaryPassword);
  const changed = await request.post('/api/auth/password', {
    headers: bearer(first),
    data: { currentPassword: temporaryPassword, newPassword: PASSWORD },
  });
  expect(changed.ok()).toBe(true);
  const token = await accessTokenOf(request, username, PASSWORD);
  const captured = await request.put('/api/account/email', {
    headers: bearer(token),
    data: { email: address },
  });
  expect(captured.ok(), await captured.text()).toBe(true);
  const link = linkIn(await emailTo(address, 'Confirma tu correo en DepAdmin'));
  const confirmed = await request.post('/api/account/email/confirm', {
    headers: bearer(token),
    data: { token: link.split('#')[1] },
  });
  expect(confirmed.ok()).toBe(true);
}

async function signIn(page: Page, username: string, password: string) {
  await page.getByLabel('Usuario').fill(username);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

test('a notice reaches everyone in the app and by email, and its email lets one stop them', async ({
  page,
  request,
}, testInfo) => {
  const reader = `avisos.e2e.${testInfo.retry}`;
  const address = `${reader}@depadmin.test`;
  const title = testInfo.retry ? `Corte de agua ${testInfo.retry}` : 'Corte de agua';
  await givenReader(request, reader, address);

  // The superadmin publishes it from «Más → Avisos».
  await page.goto('/more');
  await signIn(page, SUPERADMIN.username, SUPERADMIN.password);
  await page.getByRole('link', { name: /^Avisos/ }).click();
  await page.getByRole('button', { name: 'Publicar aviso' }).click();
  const form = page.getByRole('dialog', { name: 'Publicar aviso' });
  await form.getByLabel('Título').fill(title);
  await form.getByLabel('Aviso').fill('El jueves de 9 a 14 no habrá agua.\nLlenen sus tinacos.');
  await form.getByRole('button', { name: 'Publicar' }).click();
  await expect(form).toBeHidden();
  await expect(page.getByRole('article', { name: title, exact: true })).toBeVisible();
  await page.goto('/account');
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();

  // The reader finds it new on the home, and opening it marks it read.
  await signIn(page, reader, PASSWORD);
  const card = page.getByRole('region', { name: 'Aviso nuevo' });
  await expect(card).toContainText(title);
  await card.getByRole('link', { name: new RegExp(title) }).click();
  const notice = page.getByRole('article', { name: `${title} Nuevo` });
  await expect(notice).toContainText('Superadmin ·');
  await expect(notice).toContainText('Llenen sus tinacos.');
  await expectAccessible(page, 'avisos');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expectAccessible(page, 'avisos (oscuro)');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.getByRole('link', { name: 'Inicio' }).click();
  await expect(page.getByRole('heading', { name: `Hola, ${reader}` })).toBeVisible();
  await expect(card).toBeHidden();

  // The email carries the text, and a way out the mail app offers too.
  const email = await emailTo(address, `Aviso: ${title}`);
  expect(email.text).toContain('El superadmin publicó este aviso en DepAdmin');
  expect(email.text).toContain('El jueves de 9 a 14 no habrá agua.');
  expect(email.text).toContain(`Te llega por la cuenta «${reader}».`);
  expect(email.text).toContain(`Ver los avisos: ${BASE_URL}/notices`);
  const headers = await headersOf(email);
  expect(headers['List-Unsubscribe']?.[0]).toMatch(
    new RegExp(`^<${BASE_URL}/api/email/unsubscribe/[\\w-]+\\.NOTICES\\.[\\w-]+>$`),
  );
  expect(headers['List-Unsubscribe-Post']).toEqual(['List-Unsubscribe=One-Click']);

  // Its link stops the notices without signing in, once its button is pressed.
  await page.goto('/account');
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await page.goto(linkIn(email));
  await expect(page.getByRole('heading', { name: 'Avisos por correo' })).toBeVisible();
  await expectAccessible(page, 'dejar de recibir avisos');
  await page.getByRole('button', { name: 'Dejar de recibirlos' }).click();
  await expect(page.getByRole('status')).toContainText(
    `Listo: la cuenta «${reader}» ya no recibe los avisos por correo.`,
  );

  // Mi cuenta shows it off.
  await page.goto('/account');
  await signIn(page, reader, PASSWORD);
  await expect(page.getByRole('switch', { name: 'Avisos del edificio' })).not.toBeChecked();

  // Withdrawn, for the specs that follow.
  const admin = await accessTokenOf(request, SUPERADMIN.username, SUPERADMIN.password);
  const board = (await (await request.get('/api/notices', { headers: bearer(admin) })).json()) as {
    notices: { id: string; title: string }[];
  };
  for (const { id } of board.notices.filter((n) => n.title === title)) {
    expect((await request.delete(`/api/notices/${id}`, { headers: bearer(admin) })).ok()).toBe(
      true,
    );
  }
});
