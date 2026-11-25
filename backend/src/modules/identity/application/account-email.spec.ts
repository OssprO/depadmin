import { beforeEach, describe, expect, it } from 'vitest';
import { withCode } from '../../../../test/support/domain-error.js';
import { UnitNumber } from '../../../shared-kernel/index.js';
import { ChangeEmail, ConfirmEmail } from './account-email.js';
import { givenOwner, givenSuperadmin, identityFixture } from './testing.js';

describe('email in Mi cuenta and Usuarios', () => {
  let fx: ReturnType<typeof identityFixture>;
  let change: ChangeEmail;
  let confirm: ConfirmEmail;

  beforeEach(async () => {
    fx = identityFixture();
    const deps = [
      fx.users,
      fx.links,
      fx.secrets,
      fx.outbox,
      fx.unitOfWork,
      fx.audit,
      fx.clock,
    ] as const;
    change = new ChangeEmail(...deps);
    confirm = new ConfirmEmail(...deps);
    await givenSuperadmin(fx.users);
    await givenOwner(fx.users, UnitNumber.of(501), 'password 501');
    await givenOwner(fx.users, UnitNumber.of(502), 'password 502');
  });

  const actorOf = async (id: string) => (await fx.users.findById(id))!.actor;
  const userOf = async (id: string) => (await fx.users.findById(id))!;

  describe('ChangeEmail', () => {
    it('sends a confirmation link to the new address, which waits for it', async () => {
      const owner = await actorOf('u-501');
      await change.execute(owner, 'u-501', 'Vecina.501@Ejemplo.MX');

      expect(await userOf('u-501')).toMatchObject({
        email: null,
        pendingEmail: 'vecina.501@ejemplo.mx',
      });
      const [sent] = fx.outbox.emails;
      expect(sent).toMatchObject({
        kind: 'EMAIL_CONFIRMATION',
        to: 'vecina.501@ejemplo.mx',
        urgent: false,
        action: { label: 'Confirmar mi correo' },
      });
      expect(sent?.paragraphs.join(' ')).toContain('«501»');
      expect(sent?.action?.path).toMatch(/^\/account\/email\/confirm#link-\d+$/);
      expect(fx.audit.entries).toMatchObject([
        {
          actor: owner,
          change: {
            action: 'USER_EMAIL_REQUESTED',
            entityLabel: '501',
            changes: [{ field: 'pendingEmail', redacted: true }],
          },
        },
      ]);
    });

    it('lets the superadmin capture anyone’s, and nobody else', async () => {
      await change.execute(await actorOf('u-admin'), 'u-502', 'vecino.502@ejemplo.mx');
      expect((await userOf('u-502')).pendingEmail).toBe('vecino.502@ejemplo.mx');
      expect(fx.audit.entries[0]?.actor.role).toBe('SUPERADMIN');

      await expect(
        change.execute(await actorOf('u-501'), 'u-502', 'otro@ejemplo.mx'),
      ).rejects.toThrow(withCode('SUPERADMIN_ONLY'));
    });

    it('replaces the earlier link when the same address is asked again, without logging it', async () => {
      const owner = await actorOf('u-501');
      await change.execute(owner, 'u-501', 'vecina@ejemplo.mx');
      const first = fx.outbox.linkSentTo('vecina@ejemplo.mx');
      await change.execute(owner, 'u-501', 'vecina@ejemplo.mx');

      expect(fx.outbox.emails).toHaveLength(2);
      expect(fx.audit.actions).toEqual(['USER_EMAIL_REQUESTED']);
      await expect(confirm.execute(owner, first)).rejects.toThrow(withCode('EMAIL_LINK_INVALID'));
    });

    it('sends at most 3 confirmation links an hour to one account', async () => {
      const owner = await actorOf('u-501');
      for (const address of ['a@ejemplo.mx', 'b@ejemplo.mx', 'c@ejemplo.mx']) {
        await change.execute(owner, 'u-501', address);
      }
      await expect(change.execute(owner, 'u-501', 'd@ejemplo.mx')).rejects.toThrow(
        withCode('EMAIL_CONFIRMATION_LIMIT'),
      );
      expect((await userOf('u-501')).pendingEmail).toBe('c@ejemplo.mx');

      fx.clock.advanceSeconds(60 * 60);
      await expect(change.execute(owner, 'u-501', 'd@ejemplo.mx')).resolves.toBeDefined();
    });

    it('removes every address, ends the waiting link and logs it', async () => {
      const owner = await actorOf('u-501');
      await change.execute(owner, 'u-501', 'vecina@ejemplo.mx');
      const link = fx.outbox.linkSentTo('vecina@ejemplo.mx');

      await change.execute(owner, 'u-501', null);

      expect(await userOf('u-501')).toMatchObject({ email: null, pendingEmail: null });
      expect(fx.audit.actions).toEqual(['USER_EMAIL_REQUESTED', 'USER_EMAIL_REMOVED']);
      await expect(confirm.execute(owner, link)).rejects.toThrow(withCode('EMAIL_LINK_INVALID'));
      await expect(change.execute(owner, 'u-501', null)).rejects.toThrow(withCode('EMAIL_NONE'));
    });

    it('sends nothing when the change fails', async () => {
      await expect(change.execute(await actorOf('u-501'), 'u-501', 'no-es-correo')).rejects.toThrow(
        withCode('EMAIL_INVALID'),
      );
      expect(fx.outbox.emails).toEqual([]);
      expect(fx.links.rows.size).toBe(0);
    });
  });

  describe('ConfirmEmail', () => {
    it('makes the address the confirmed one, once, for the account signed in', async () => {
      const owner = await actorOf('u-501');
      await change.execute(owner, 'u-501', 'vecina@ejemplo.mx');

      await confirm.execute(owner, fx.outbox.linkSentTo('vecina@ejemplo.mx'));

      expect(await userOf('u-501')).toMatchObject({
        email: 'vecina@ejemplo.mx',
        pendingEmail: null,
      });
      expect(fx.audit.actions).toEqual(['USER_EMAIL_REQUESTED', 'USER_EMAIL_CONFIRMED']);
      // No earlier address to tell.
      expect(fx.outbox.emails).toHaveLength(1);
    });

    it('answers that it is confirmed when the link is followed again', async () => {
      const owner = await actorOf('u-501');
      await change.execute(owner, 'u-501', 'vecina@ejemplo.mx');
      const link = fx.outbox.linkSentTo('vecina@ejemplo.mx');
      await confirm.execute(owner, link);

      await expect(confirm.execute(owner, link)).resolves.toMatchObject({
        email: 'vecina@ejemplo.mx',
      });
      expect(fx.audit.actions).toHaveLength(2);
    });

    it('tells the address it replaces, which kept working until then', async () => {
      const owner = await actorOf('u-501');
      await change.execute(owner, 'u-501', 'antes@ejemplo.mx');
      await confirm.execute(owner, fx.outbox.linkSentTo('antes@ejemplo.mx'));
      await change.execute(owner, 'u-501', 'nueva@ejemplo.mx');
      expect((await userOf('u-501')).email).toBe('antes@ejemplo.mx');

      await confirm.execute(owner, fx.outbox.linkSentTo('nueva@ejemplo.mx'));

      expect(fx.outbox.emails.at(-1)).toMatchObject({
        kind: 'EMAIL_CHANGED',
        to: 'antes@ejemplo.mx',
        action: null,
      });
      expect(fx.outbox.emails.at(-1)?.paragraphs.join(' ')).not.toContain('nueva@');
    });

    it('needs the account the link is for: a stranger with the email cannot confirm it', async () => {
      await change.execute(await actorOf('u-admin'), 'u-502', 'equivocado@ejemplo.mx');
      const link = fx.outbox.linkSentTo('equivocado@ejemplo.mx');

      for (const actor of [await actorOf('u-501'), await actorOf('u-admin')]) {
        await expect(confirm.execute(actor, link)).rejects.toThrow(
          withCode('EMAIL_LINK_OTHER_ACCOUNT'),
        );
      }
      expect((await userOf('u-502')).email).toBeNull();
    });

    it('refuses an unknown or expired link', async () => {
      const owner = await actorOf('u-501');
      await expect(confirm.execute(owner, 'link-unknown')).rejects.toThrow(
        withCode('EMAIL_LINK_INVALID'),
      );

      await change.execute(owner, 'u-501', 'vecina@ejemplo.mx');
      fx.clock.advanceDays(60);
      await expect(
        confirm.execute(owner, fx.outbox.linkSentTo('vecina@ejemplo.mx')),
      ).rejects.toThrow(withCode('EMAIL_LINK_INVALID'));
    });
  });
});
