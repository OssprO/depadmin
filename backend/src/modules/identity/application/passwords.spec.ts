import { beforeEach, describe, expect, it } from 'vitest';
import { withCode } from '../../../../test/support/domain-error.js';
import { UnitNumber } from '../../../shared-kernel/index.js';
import { ChangePassword } from './change-password.js';
import { ResetPassword } from './reset-password.js';
import { SignIn } from './sign-in.js';
import {
  fakeHasher,
  givenOwner,
  givenSuperadmin,
  identityFixture,
  immediateUnitOfWork,
} from './testing.js';
import { GetCurrentUser, ListUsers } from './user-queries.js';

describe('passwords and accounts', () => {
  let fx: ReturnType<typeof identityFixture>;
  let signIn: SignIn;
  let change: ChangePassword;
  let reset: ResetPassword;

  beforeEach(async () => {
    fx = identityFixture();
    signIn = new SignIn(fx.users, fakeHasher, immediateUnitOfWork, fx.sessions);
    change = new ChangePassword(
      fx.users,
      fx.refreshTokens,
      fakeHasher,
      fx.unitOfWork,
      fx.audit,
      fx.clock,
      fx.sessions,
    );
    reset = new ResetPassword(
      fx.users,
      fx.refreshTokens,
      fakeHasher,
      fx.secrets,
      fx.unitOfWork,
      fx.audit,
      fx.clock,
    );
    await givenSuperadmin(fx.users);
    await givenOwner(fx.users, UnitNumber.of(501), 'old password');
    await givenOwner(fx.users, UnitNumber.of(502), null);
  });

  const actorOf = async (id: string) => (await fx.users.findById(id))!.actor;

  describe('ChangePassword', () => {
    it('replaces the password, ends every session and starts a new one', async () => {
      await signIn.execute({ username: '501', password: 'old password' });
      await signIn.execute({ username: '501', password: 'old password' });

      const session = await change.execute(await actorOf('u-501'), {
        currentPassword: 'old password',
        newPassword: 'new password',
      });

      expect(fx.refreshTokens.activeSessionsOf('u-501', fx.clock.now())).toHaveLength(1);
      expect(session.user.mustChangePassword).toBe(false);
      await expect(
        signIn.execute({ username: '501', password: 'new password' }),
      ).resolves.toBeDefined();
      await expect(signIn.execute({ username: '501', password: 'old password' })).rejects.toThrow(
        withCode('INVALID_CREDENTIALS'),
      );
    });

    it('records the change in the audit log, without the password', async () => {
      const actor = await actorOf('u-501');
      await change.execute(actor, { currentPassword: 'old password', newPassword: 'new password' });

      expect(fx.audit.entries).toEqual([
        {
          actor,
          change: {
            action: 'USER_PASSWORD_CHANGED',
            entity: 'user',
            entityId: 'u-501',
            entityLabel: '501',
            changes: [{ field: 'password', redacted: true }],
          },
        },
      ]);
      expect(JSON.stringify(fx.audit.entries)).not.toContain('hashed:');
    });

    it('requires the current password', async () => {
      await expect(
        change.execute(await actorOf('u-501'), {
          currentPassword: 'guess',
          newPassword: 'new password',
        }),
      ).rejects.toThrow(withCode('CURRENT_PASSWORD_INCORRECT'));
    });

    it('rejects keeping the same password', async () => {
      await expect(
        change.execute(await actorOf('u-501'), {
          currentPassword: 'old password',
          newPassword: 'old password',
        }),
      ).rejects.toThrow(withCode('PASSWORD_UNCHANGED'));
    });
  });

  describe('ResetPassword', () => {
    it('gives an owner a temporary password that must be changed', async () => {
      const { temporaryPassword } = await reset.execute(await actorOf('u-admin'), 'u-502');

      const session = await signIn.execute({ username: '502', password: temporaryPassword });
      expect(session.user.mustChangePassword).toBe(true);

      await change.execute(session.user.actor, {
        currentPassword: temporaryPassword,
        newPassword: 'my own password',
      });
      expect((await fx.users.findById('u-502'))?.mustChangePassword).toBe(false);
    });

    it('records who reset whose password, without the temporary one', async () => {
      const admin = await actorOf('u-admin');
      const { temporaryPassword } = await reset.execute(admin, 'u-502');

      expect(fx.audit.entries).toEqual([
        {
          actor: admin,
          change: expect.objectContaining({
            action: 'USER_PASSWORD_RESET',
            entityId: 'u-502',
            entityLabel: '502',
            changes: [
              { field: 'password', redacted: true },
              { field: 'mustChangePassword', before: false, after: true },
            ],
          }) as unknown,
        },
      ]);
      expect(JSON.stringify(fx.audit.entries)).not.toContain(temporaryPassword);
    });

    it('records nothing when it is refused', async () => {
      await expect(reset.execute(await actorOf('u-501'), 'u-502')).rejects.toThrow();
      await expect(
        change.execute(await actorOf('u-501'), {
          currentPassword: 'guess',
          newPassword: 'x'.repeat(12),
        }),
      ).rejects.toThrow();

      expect(fx.audit.entries).toEqual([]);
    });

    it('signs the user out everywhere', async () => {
      await signIn.execute({ username: '501', password: 'old password' });

      await reset.execute(await actorOf('u-admin'), 'u-501');

      expect(fx.refreshTokens.activeSessionsOf('u-501', fx.clock.now())).toEqual([]);
    });

    it('is for the superadmin only, and not on their own account', async () => {
      await expect(reset.execute(await actorOf('u-501'), 'u-502')).rejects.toThrow(
        withCode('SUPERADMIN_ONLY'),
      );
      await expect(reset.execute(await actorOf('u-admin'), 'u-admin')).rejects.toThrow(
        withCode('CANNOT_RESET_OWN_PASSWORD'),
      );
      await expect(reset.execute(await actorOf('u-admin'), 'nobody')).rejects.toThrow(
        withCode('USER_NOT_FOUND'),
      );
    });
  });

  describe('queries', () => {
    it('returns the current user', async () => {
      const user = await new GetCurrentUser(fx.users).execute(await actorOf('u-501'));
      expect(user.username).toBe('501');
    });

    it('lists every user, for the superadmin only', async () => {
      const list = new ListUsers(fx.users);

      expect(await list.execute(await actorOf('u-admin'))).toHaveLength(3);
      expect(() =>
        list.execute({ role: 'OWNER', userId: 'u-501', unit: UnitNumber.of(501) }),
      ).toThrow(withCode('SUPERADMIN_ONLY'));
    });
  });
});
