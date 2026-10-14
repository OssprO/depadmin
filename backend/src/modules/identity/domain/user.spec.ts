import { describe, expect, it } from 'vitest';
import { withCode } from '../../../../test/support/domain-error.js';
import { UnitNumber } from '../../../shared-kernel/index.js';
import { normalizeUsername, User, type UserProps } from './user.js';

const owner: UserProps = {
  id: 'u-501',
  username: '501',
  role: 'OWNER',
  unit: UnitNumber.of(501),
  passwordHash: 'hash',
  mustChangePassword: false,
};

describe('User', () => {
  it('creates an owner named after its depto, unable to sign in until reset', () => {
    const user = User.createOwner('u-501', UnitNumber.of(501));

    expect(user.username).toBe('501');
    expect(user.canSignIn).toBe(false);
    expect(user.actor).toEqual({ role: 'OWNER', userId: 'u-501', unit: UnitNumber.of(501) });
  });

  it('creates the superadmin outside any depto', () => {
    const user = User.createSuperadmin('u-admin', ' Admin ', 'hash');

    expect(user.username).toBe('admin');
    expect(user.canSignIn).toBe(true);
    expect(user.actor).toEqual({ role: 'SUPERADMIN', userId: 'u-admin' });
  });

  it('normalizes usernames so they are case-insensitive', () => {
    expect(normalizeUsername('  OsSpro ')).toBe('osspro');
  });

  it.each(['ab', 'con espacio', 'ñandú', 'x'.repeat(33)])('rejects the username "%s"', (name) => {
    expect(() => User.restore({ ...owner, username: name })).toThrow(withCode('USERNAME_INVALID'));
  });

  it('requires a depto for owners and none for the superadmin', () => {
    expect(() => User.restore({ ...owner, unit: null })).toThrow(withCode('USER_UNIT_INVALID'));
    expect(() => User.restore({ ...owner, role: 'SUPERADMIN' })).toThrow(
      withCode('USER_UNIT_INVALID'),
    );
  });

  it('cannot require a password change without a password', () => {
    expect(() => User.restore({ ...owner, passwordHash: null, mustChangePassword: true })).toThrow(
      withCode('USER_PASSWORD_INVALID'),
    );
  });

  it('requires a change after a reset, and clears it once changed', () => {
    const user = User.restore({ ...owner, passwordHash: null });

    user.resetPassword('temporary-hash');
    expect(user).toMatchObject({ passwordHash: 'temporary-hash', mustChangePassword: true });
    expect(user.canSignIn).toBe(true);

    user.changePassword('new-hash');
    expect(user).toMatchObject({ passwordHash: 'new-hash', mustChangePassword: false });
  });
});
