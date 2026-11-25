import type { CurrentUser, Role } from '@depadmin/shared';

/** "Depto 501" for owners, the username for the superadmin and the read-only users. */
export function userLabel(user: Pick<CurrentUser, 'role' | 'unit' | 'username'>): string {
  return user.role === 'OWNER' ? `Depto ${user.unit}` : user.username;
}

export const ROLES: Record<Role, string> = {
  SUPERADMIN: 'Superadmin',
  OWNER: 'Dueño',
  READER: 'Solo lectura',
};

type Account = Pick<CurrentUser, 'role' | 'unit' | 'username'>;

/** What assistive technology announces for the account badge: «Cuenta: Depto 501, dueño». */
export function accountName(user: Account): string {
  return `Cuenta: ${userLabel(user)}, ${ROLES[user.role].toLowerCase()}`;
}

/**
 * The browser tab's title: «DepAdmin · 501», «DepAdmin · Superadmin». The administrator has
 * two accounts (501 and the superadmin), so two windows signed in apart can be told apart.
 */
export function accountTitle(user: Account): string {
  return `DepAdmin · ${user.role === 'SUPERADMIN' ? ROLES.SUPERADMIN : user.username}`;
}
