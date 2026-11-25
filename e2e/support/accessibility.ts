import { AxeBuilder } from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

// The WCAG 2.1 A and AA rules that axe can check automatically (contrast, names, landmarks,
// ARIA), on the whole page or on a part of it.

export async function expectAccessible(page: Page, screen: string, part?: string) {
  const axe = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);
  if (part) axe.include(part);
  const { violations } = await axe.analyze();
  const found = violations.map(
    (v) => `${screen}: ${v.id} (${v.impact}) ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
  );
  expect(found).toEqual([]);
}

/**
 * The account badge (phase 37) in light and dark: each role has its own colors, and
 * screens-accessibility.spec only signs in as the superadmin.
 */
export async function expectAccountBadgeAccessible(page: Page, account: string) {
  const badge = '[data-slot="account-badge"]';
  await expect(page.locator(badge)).toBeVisible();
  await expectAccessible(page, account, badge);
  await page.emulateMedia({ colorScheme: 'dark' });
  await expectAccessible(page, `${account} (oscuro)`, badge);
  await page.emulateMedia({ colorScheme: 'light' });
}
