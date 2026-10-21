import { describe, expect, it } from 'vitest';
import { withCode } from '../../../../test/support/domain-error.js';
import { LocalDate, UnitNumber } from '../../../shared-kernel/index.js';
import { normalizeUsername, User, type UserProps } from './user.js';

const owner: UserProps = {
  id: 'u-501',
  username: '501',
  role: 'OWNER',
  unit: UnitNumber.of(501),
  passwordHash: 'hash',
  mustChangePassword: false,
  expiresOn: null,
  disabled: false,
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

  describe('read-only users and access', () => {
    const d = (text: string) => LocalDate.parse(text);
    const tenant = () =>
      User.createReader(
        'u-t',
        ' Inquilino.302 ',
        { unit: UnitNumber.of(302), expiresOn: d('2026-12-31') },
        'temporary-hash',
      );

    it('creates a reader of a depto, or of none, with a password to change', () => {
      const user = tenant();
      expect(user).toMatchObject({
        username: 'inquilino.302',
        role: 'READER',
        mustChangePassword: true,
      });
      expect(user.actor).toEqual({ role: 'READER', userId: 'u-t', unit: UnitNumber.of(302) });
      const accountant = User.createReader('u-c', 'contador', { unit: null, expiresOn: null }, 'h');
      expect(accountant.actor).toEqual({ role: 'READER', userId: 'u-c', unit: null });
    });

    it('keeps numbers alone for the owners', () => {
      expect(() => User.createReader('u-x', '302', { unit: null, expiresOn: null }, 'h')).toThrow(
        withCode('USERNAME_RESERVED'),
      );
    });

    it('signs in until its last day, and not while deactivated', () => {
      const user = tenant();
      expect(user.canSignInOn(d('2026-12-31'))).toBe(true);
      expect(user.hasExpiredOn(d('2027-01-01'))).toBe(true);
      expect(user.canSignInOn(d('2027-01-01'))).toBe(false);

      user.disable();
      expect(user.canSignInOn(d('2026-10-01'))).toBe(false);
      expect(() => user.disable()).toThrow(withCode('USER_ALREADY_DISABLED'));
      user.enable();
      expect(user.canSignInOn(d('2026-10-01'))).toBe(true);
      expect(() => user.enable()).toThrow(withCode('USER_NOT_DISABLED'));
    });

    it("changes a reader's depto and anyone's expiry, but an owner keeps its depto", () => {
      const user = tenant();
      user.changeAccess({ unit: null, expiresOn: null });
      expect(user).toMatchObject({ unit: null, expiresOn: null });

      const owner501 = User.createOwner('u-501', UnitNumber.of(501));
      owner501.changeAccess({ unit: UnitNumber.of(501), expiresOn: d('2026-12-31') });
      expect(owner501.expiresOn).toEqual(d('2026-12-31'));
      expect(() => owner501.changeAccess({ unit: UnitNumber.of(502), expiresOn: null })).toThrow(
        withCode('USER_UNIT_INVALID'),
      );
      expect(() => owner501.changeAccess({ unit: null, expiresOn: null })).toThrow(
        withCode('USER_UNIT_INVALID'),
      );
    });

    it('never expires or switches off the superadmin', () => {
      const admin = User.createSuperadmin('u-admin', 'admin', 'hash');
      expect(() => admin.disable()).toThrow(withCode('SUPERADMIN_ACCESS_FIXED'));
      expect(() => admin.changeAccess({ unit: null, expiresOn: d('2026-12-31') })).toThrow(
        withCode('SUPERADMIN_ACCESS_FIXED'),
      );
      expect(() =>
        User.restore({ ...owner, role: 'SUPERADMIN', unit: null, disabled: true }),
      ).toThrow(withCode('USER_UNIT_INVALID'));
    });
  });
});
