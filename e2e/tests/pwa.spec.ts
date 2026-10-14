import { expect, test } from '@playwright/test';

interface Manifest {
  readonly name: string;
  readonly display: string;
  readonly start_url: string;
  readonly icons: readonly { src: string; sizes: string; purpose?: string }[];
}

test('can be installed on the phone: a manifest with its icons', async ({ page, request }) => {
  await page.goto('/login');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBe('/manifest.webmanifest');

  const manifest = (await (await request.get(href ?? '')).json()) as Manifest;
  expect(manifest).toMatchObject({ display: 'standalone', start_url: '/' });
  // Chrome installs with a 192 and a 512 icon; Android masks the maskable one.
  expect(manifest.icons.map((icon) => `${icon.sizes} ${icon.purpose ?? 'any'}`)).toEqual([
    '192x192 any',
    '512x512 any',
    '512x512 maskable',
  ]);
  for (const icon of manifest.icons) {
    const response = await request.get(icon.src);
    expect(response.status(), icon.src).toBe(200);
    expect(response.headers()['content-type']).toBe('image/png');
  }
  const appleIcon = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
  expect((await request.get(appleIcon ?? '')).status()).toBe(200);
});
