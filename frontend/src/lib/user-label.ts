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
