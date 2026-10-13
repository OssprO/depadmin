import type { UnitNumber } from '../../../shared-kernel/index.js';

export type Role = 'SUPERADMIN' | 'OWNER';

/** Who is acting. Every owner belongs to exactly one depto (spec 2). */
export type Actor =
  | { readonly role: 'SUPERADMIN'; readonly userId: string }
  | { readonly role: 'OWNER'; readonly userId: string; readonly unit: UnitNumber };
