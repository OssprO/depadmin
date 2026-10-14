import type { CurrentUser } from '@depadmin/shared';

/** "Depto 501" for owners, the username for the superadmin. */
export function userLabel(user: Pick<CurrentUser, 'unit' | 'username'>): string {
  return user.unit === null ? user.username : `Depto ${user.unit}`;
}
