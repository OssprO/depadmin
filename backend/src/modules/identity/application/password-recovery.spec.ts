import { beforeEach, describe, expect, it } from 'vitest';
import { withCode } from '../../../../test/support/domain-error.js';
import { UnitNumber } from '../../../shared-kernel/index.js';
import { UserToken } from '../domain/index.js';
import { ChangePassword } from './change-password.js';
import {
  CheckRecoveryLink,
  PasswordRecoveryAvailability,
  RecoverPassword,
  RequestPasswordRecovery,
} from './password-recovery.js';
import { ResetPassword } from './reset-password.js';
import { SignIn } from './sign-in.js';
import { fakeHasher, givenOwner, givenSuperadmin, identityFixture } from './testing.js';

describe('password recovery', () => {
  let fx: ReturnType<typeof identityFixture>;
  let request: RequestPasswordRecovery;
  let check: CheckRecoveryLink;
  let recover: RecoverPassword;
  let signIn: SignIn;

  beforeEach(async () => {
    fx = identityFixture();
    request = new RequestPasswordRecovery(
      fx.users,
      fx.links,
      fx.secrets,
      fx.outbox,
      fx.unitOfWork,
      fx.clock,
    );
    check = new CheckRecoveryLink(fx.users, fx.links, fx.secrets, fx.clock);
    recover = new RecoverPassword(
      fx.users,
      fx.links,
      fx.secrets,
      fx.refreshTokens,
      fakeHasher,
      fx.outbox,
      fx.unitOfWork,
      fx.audit,
      fx.clock,
    );
    signIn = new SignIn(fx.users, fakeHasher, fx.unitOfWork, fx.clock, fx.sessions);
    await givenSuperadmin(fx.users);
    await givenOwner(fx.users, UnitNumber.of(501), 'old password');
    await withEmail('u-501', 'vecina@ejemplo.mx');
  });

  async function withEmail(id: string, email: string) {
    const user = (await fx.users.findById(id))!;
    user.requestEmail(email);
    user.confirmEmail(email);
    await fx.users.save(user);
  }

  const recoveryLink = () => fx.outbox.linkSentTo('vecina@ejemplo.mx');

  describe('RequestPasswordRecovery', () => {
    it('sends an urgent one-hour link to the confirmed email', async () => {
      await request.execute(' 501 ');

      expect(fx.outbox.emails).toMatchObject([
        { kind: 'PASSWORD_RECOVERY', to: 'vecina@ejemplo.mx', urgent: true },
      ]);
      const [sent] = fx.outbox.emails;
      expect(sent?.action?.path).toMatch(/^\/reset-password#link-\d+$/);
      expect(sent?.sendBy).toEqual(fx.clock.now().plusSeconds(60 * 60));
      expect(sent?.paragraphs.join(' ')).toContain('«501»');
    });

    it('sends nothing, and says nothing, for anyone it cannot help', async () => {
      await givenOwner(fx.users, UnitNumber.of(502), 'password 502');
      const off = await givenOwner(fx.users, UnitNumber.of(401), 'password 401');
      await withEmail(off.id, 'apagado@ejemplo.mx');
      const disabled = (await fx.users.findById(off.id))!;
      disabled.disable();
      await fx.users.save(disabled);
      const unconfirmed = (await fx.users.findById('u-502'))!;
      unconfirmed.requestEmail('sin-confirmar@ejemplo.mx');
      await fx.users.save(unconfirmed);

      for (const username of ['nadie', '502', '401']) {
        await expect(request.execute(username)).resolves.toBeUndefined();
      }
      expect(fx.outbox.emails).toEqual([]);
    });

    it('sends nothing without a provider: the link would wait longer than it lasts', async () => {
      fx.outbox.delivers = false;
      await request.execute('501');

      expect(fx.outbox.emails).toEqual([]);
      expect(new PasswordRecoveryAvailability(fx.outbox).execute()).toBe(false);
    });

    it('replaces the earlier link, and stops quietly after 3 in an hour', async () => {
      await request.execute('501');
      const first = recoveryLink();
      await request.execute('501');
      await request.execute('501');
      await request.execute('501');

      expect(fx.outbox.emails).toHaveLength(3);
      await expect(check.execute(first)).rejects.toThrow(withCode('RECOVERY_LINK_INVALID'));
      await expect(check.execute(recoveryLink())).resolves.toEqual({ username: '501' });

      fx.clock.advanceSeconds(60 * 60);
      await request.execute('501');
      expect(fx.outbox.emails).toHaveLength(4);
    });
  });

  describe('RecoverPassword', () => {
    it('sets the new password, uses the link, ends every session and logs it', async () => {
      await signIn.execute({ username: '501', password: 'old password' });
      await request.execute('501');

      await recover.execute(recoveryLink(), 'new password');

      await expect(
        signIn.execute({ username: '501', password: 'new password' }),
      ).resolves.toBeDefined();
      expect(fx.refreshTokens.activeSessionsOf('u-501', fx.clock.now())).toHaveLength(1);
      expect(fx.audit.entries).toMatchObject([
        {
          actor: { role: 'OWNER', userId: 'u-501' },
          change: {
            action: 'USER_PASSWORD_RECOVERED',
            changes: [{ field: 'password', redacted: true }],
          },
        },
      ]);
      expect(fx.outbox.emails.at(-1)).toMatchObject({
        kind: 'PASSWORD_CHANGED',
        to: 'vecina@ejemplo.mx',
      });
      await expect(recover.execute(recoveryLink(), 'another password')).rejects.toThrow(
        withCode('RECOVERY_LINK_INVALID'),
      );
    });

    it('replaces a temporary password too', async () => {
      const owner = (await fx.users.findById('u-501'))!;
      owner.resetPassword(await fakeHasher.hash('temporary'));
      await fx.users.save(owner);
      await request.execute('501');

      await recover.execute(recoveryLink(), 'new password');

      expect((await fx.users.findById('u-501'))!.mustChangePassword).toBe(false);
    });

    it('refuses an expired link, and one whose account was switched off since', async () => {
      await request.execute('501');
      fx.clock.advanceSeconds(60 * 60);
      await expect(recover.execute(recoveryLink(), 'new password')).rejects.toThrow(
        withCode('RECOVERY_LINK_INVALID'),
      );

      fx.clock.advanceSeconds(60 * 60);
      await request.execute('501');
      const owner = (await fx.users.findById('u-501'))!;
      owner.disable();
      await fx.users.save(owner);
      await expect(check.execute(recoveryLink())).rejects.toThrow(
        withCode('RECOVERY_LINK_INVALID'),
      );
    });

    it('takes neither an unknown link nor a confirmation link', async () => {
      const confirmation = UserToken.emailConfirmation(
        { id: 'l-confirm', tokenHash: fx.secrets.hashLinkToken('confirm') },
        'u-501',
        'nueva@ejemplo.mx',
        fx.clock.now(),
      );
      await fx.links.add(confirmation);

      for (const token of ['unknown', 'confirm']) {
        await expect(recover.execute(token, 'new password')).rejects.toThrow(
          withCode('RECOVERY_LINK_INVALID'),
        );
      }
    });
  });

  describe('the security notice', () => {
    it('goes out whenever an account with an email gets a new password', async () => {
      const change = new ChangePassword(
        fx.users,
        fx.refreshTokens,
        fakeHasher,
        fx.unitOfWork,
        fx.audit,
        fx.clock,
        fx.outbox,
        fx.sessions,
      );
      const reset = new ResetPassword(
        fx.users,
        fx.refreshTokens,
        fakeHasher,
        fx.secrets,
        fx.unitOfWork,
        fx.audit,
        fx.clock,
        fx.outbox,
      );
      const owner = (await fx.users.findById('u-501'))!.actor;
      await change.execute(owner, { currentPassword: 'old password', newPassword: 'new password' });
      await reset.execute((await fx.users.findById('u-admin'))!.actor, 'u-501');
      await givenOwner(fx.users, UnitNumber.of(502), null);
      await reset.execute((await fx.users.findById('u-admin'))!.actor, 'u-502');

      expect(fx.outbox.emails.map((email) => [email.kind, email.to])).toEqual([
        ['PASSWORD_CHANGED', 'vecina@ejemplo.mx'],
        ['PASSWORD_CHANGED', 'vecina@ejemplo.mx'],
      ]);
    });
  });
});
