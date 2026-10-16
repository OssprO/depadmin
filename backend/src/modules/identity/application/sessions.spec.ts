import { beforeEach, describe, expect, it } from 'vitest';
import { withCode } from '../../../../test/support/domain-error.js';
import { UnitNumber } from '../../../shared-kernel/index.js';
import { REFRESH_TOKEN_LIFETIME_DAYS } from '../domain/index.js';
import { PurgeExpiredSessions } from './purge-expired-sessions.js';
import { RefreshSession } from './refresh-session.js';
import { SignIn } from './sign-in.js';
import { SignOut } from './sign-out.js';
import { fakeHasher, givenOwner, identityFixture, immediateUnitOfWork } from './testing.js';

describe('sessions', () => {
  let fx: ReturnType<typeof identityFixture>;
  let signIn: SignIn;
  let refresh: RefreshSession;
  let signOut: SignOut;

  beforeEach(async () => {
    fx = identityFixture();
    signIn = new SignIn(fx.users, fakeHasher, immediateUnitOfWork, fx.clock, fx.sessions);
    refresh = new RefreshSession(
      fx.refreshTokens,
      fx.users,
      fx.secrets,
      immediateUnitOfWork,
      fx.clock,
      fx.sessions,
    );
    signOut = new SignOut(fx.refreshTokens, fx.secrets, fx.clock);
    await givenOwner(fx.users, UnitNumber.of(501), 'correct horse');
    await givenOwner(fx.users, UnitNumber.of(502), null);
  });

  describe('SignIn', () => {
    it('starts a session with an access token and a refresh token', async () => {
      const session = await signIn.execute({ username: '501', password: 'correct horse' });

      expect(session.user.username).toBe('501');
      expect(session.accessToken.token).toBe('access-for-u-501');
      expect(session.refreshToken.expiresAt).toEqual(
        fx.clock.now().plusDays(REFRESH_TOKEN_LIFETIME_DAYS),
      );
      expect(fx.refreshTokens.activeSessionsOf('u-501', fx.clock.now())).toHaveLength(1);
    });

    it.each([
      ['a wrong password', '501', 'wrong'],
      ['an unknown user', '999', 'correct horse'],
      ['an owner who has no password yet', '502', ''],
    ])('gives the same answer for %s', async (_case, username, password) => {
      await expect(signIn.execute({ username, password })).rejects.toThrow(
        withCode('INVALID_CREDENTIALS'),
      );
    });
  });

  describe('RefreshSession', () => {
    it('rotates the refresh token: the new one works, in the same session', async () => {
      const first = await signIn.execute({ username: '501', password: 'correct horse' });
      fx.clock.advanceDays(20);

      const second = await refresh.execute(first.refreshToken.token);
      const third = await refresh.execute(second.refreshToken.token);

      expect(third.refreshToken.token).not.toBe(second.refreshToken.token);
      expect(third.refreshToken.expiresAt).toEqual(
        fx.clock.now().plusDays(REFRESH_TOKEN_LIFETIME_DAYS),
      );
      expect(fx.refreshTokens.activeSessionsOf('u-501', fx.clock.now())).toHaveLength(1);
    });

    it('revokes the whole session when a rotated token is presented again', async () => {
      const first = await signIn.execute({ username: '501', password: 'correct horse' });
      const second = await refresh.execute(first.refreshToken.token);

      await expect(refresh.execute(first.refreshToken.token)).rejects.toThrow(
        withCode('REFRESH_TOKEN_REUSED'),
      );
      await expect(refresh.execute(second.refreshToken.token)).rejects.toThrow(
        withCode('SESSION_INVALID'),
      );
    });

    it('treats losing a concurrent rotation as a reuse', async () => {
      const first = await signIn.execute({ username: '501', password: 'correct horse' });
      const rotate = fx.refreshTokens.rotate.bind(fx.refreshTokens);
      fx.refreshTokens.rotate = () => Promise.resolve(false);

      await expect(refresh.execute(first.refreshToken.token)).rejects.toThrow(
        withCode('REFRESH_TOKEN_REUSED'),
      );
      fx.refreshTokens.rotate = rotate;
      expect(fx.refreshTokens.activeSessionsOf('u-501', fx.clock.now())).toEqual([]);
    });

    it('rejects unknown and expired tokens', async () => {
      const session = await signIn.execute({ username: '501', password: 'correct horse' });
      fx.clock.advanceDays(REFRESH_TOKEN_LIFETIME_DAYS);

      await expect(refresh.execute('made-up')).rejects.toThrow(withCode('SESSION_INVALID'));
      await expect(refresh.execute(session.refreshToken.token)).rejects.toThrow(
        withCode('SESSION_INVALID'),
      );
    });

    it('ends the session if the user can no longer sign in', async () => {
      const session = await signIn.execute({ username: '501', password: 'correct horse' });
      fx.users.rows.delete('u-501');

      await expect(refresh.execute(session.refreshToken.token)).rejects.toThrow(
        withCode('SESSION_INVALID'),
      );
      expect(fx.refreshTokens.activeSessionsOf('u-501', fx.clock.now())).toEqual([]);
    });
  });

  describe('SignOut', () => {
    it('revokes the session, and signing out again is harmless', async () => {
      const session = await signIn.execute({ username: '501', password: 'correct horse' });

      await signOut.execute(session.refreshToken.token);
      await signOut.execute(session.refreshToken.token);
      await signOut.execute(undefined);
      await signOut.execute('made-up');

      await expect(refresh.execute(session.refreshToken.token)).rejects.toThrow(
        withCode('SESSION_INVALID'),
      );
    });

    it('leaves the user’s other sessions alone', async () => {
      const phone = await signIn.execute({ username: '501', password: 'correct horse' });
      const laptop = await signIn.execute({ username: '501', password: 'correct horse' });

      await signOut.execute(phone.refreshToken.token);

      await expect(refresh.execute(laptop.refreshToken.token)).resolves.toBeDefined();
    });
  });

  describe('PurgeExpiredSessions', () => {
    it('deletes only the refresh tokens that have expired', async () => {
      const purge = new PurgeExpiredSessions(fx.refreshTokens, fx.clock);
      await signIn.execute({ username: '501', password: 'correct horse' });
      fx.clock.advanceDays(REFRESH_TOKEN_LIFETIME_DAYS - 1);
      await signIn.execute({ username: '501', password: 'correct horse' });

      expect(await purge.execute()).toBe(0);
      fx.clock.advanceDays(2);
      expect(await purge.execute()).toBe(1);
      expect(fx.refreshTokens.rows.size).toBe(1);
    });
  });
});
