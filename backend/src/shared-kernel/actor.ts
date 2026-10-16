import type { UnitNumber } from './unit-number.js';

export type Role = 'SUPERADMIN' | 'OWNER' | 'READER';

/**
 * Who is acting: the authenticated user as every module sees it. Every owner belongs to
 * exactly one depto (spec 2); the superadmin belongs to none. A read-only user (a tenant,
 * a relative, an accountant) sees what an owner sees and never writes; it may be tied to a
 * depto or to none.
 */
export type Actor =
  | { readonly role: 'SUPERADMIN'; readonly userId: string }
  | { readonly role: 'OWNER'; readonly userId: string; readonly unit: UnitNumber }
  | { readonly role: 'READER'; readonly userId: string; readonly unit: UnitNumber | null };

/**
 * The app itself, for what runs on a schedule with nobody behind it (opening the month when
 * nobody did). It is never a signed-in user, so no use case accepts it as an `Actor`.
 */
export interface SystemActor {
  readonly role: 'SYSTEM';
  readonly userId: 'system';
}

export const SYSTEM_ACTOR: SystemActor = { role: 'SYSTEM', userId: 'system' };

/** Whom a change is recorded under in the audit log: a user, or the app itself. */
export type ChangeAuthor = Actor | SystemActor;
