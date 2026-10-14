import type { UnitNumber } from './unit-number.js';

export type Role = 'SUPERADMIN' | 'OWNER';

/**
 * Who is acting: the authenticated user as every module sees it. Every owner belongs to
 * exactly one depto (spec 2); the superadmin belongs to none.
 */
export type Actor =
  | { readonly role: 'SUPERADMIN'; readonly userId: string }
  | { readonly role: 'OWNER'; readonly userId: string; readonly unit: UnitNumber };
