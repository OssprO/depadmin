import { beforeEach, describe, expect, it } from 'vitest';
import { withCode } from '../../../../test/support/domain-error.js';
import { LocalDate, UnitNumber } from '../../../shared-kernel/index.js';
import type { User } from '../domain/index.js';
import { HmacUnsubscribeLinks } from '../infrastructure/hmac-unsubscribe-links.js';
import { ChangeEmailTopic, EmailRecipients, Unsubscribe } from './email-topics.js';
import { givenOwner, givenSuperadmin, identityFixture } from './testing.js';

describe('the optional emails (ADR-0034)', () => {
  let fx: ReturnType<typeof identityFixture>;
  const links = new HmacUnsubscribeLinks('a-secret-of-at-least-thirty-two-characters');
  let change: ChangeEmailTopic;
  let unsubscribe: Unsubscribe;
  let recipients: EmailRecipients;

  /** Stores the user after `update`, as the use cases would. */
  const given = async (user: User, update: (user: User) => void = () => undefined) => {
    update(user);
    await fx.users.save(user);
    return user;
  };
  const withEmail = (address: string) => (user: User) => {
    user.confirmEmail(user.requestEmail(address));
  };
  const userOf = async (id: string) => (await fx.users.findById(id))!;

  beforeEach(async () => {
    fx = identityFixture();
    change = new ChangeEmailTopic(fx.users, fx.unitOfWork, fx.audit);
    unsubscribe = new Unsubscribe(fx.users, links, fx.unitOfWork, fx.audit);
    recipients = new EmailRecipients(fx.users, links, fx.clock);
    await given(await givenSuperadmin(fx.users), withEmail('admin@ejemplo.mx'));
    await given(
      await givenOwner(fx.users, UnitNumber.of(501), 'p 501'),
      withEmail('admin@ejemplo.mx'),
    );
    await given(
      await givenOwner(fx.users, UnitNumber.of(502), 'p 502'),
      withEmail('vecina@ejemplo.mx'),
    );
  });

  describe('ChangeEmailTopic', () => {
    it('turns the notices off and on for the account, audited', async () => {
      const owner = (await userOf('u-502')).actor;

      await change.execute(owner, 'NOTICES', false);
      expect((await userOf('u-502')).wants('NOTICES')).toBe(false);
      await change.execute(owner, 'NOTICES', true);

      expect((await userOf('u-502')).wants('NOTICES')).toBe(true);
      expect(fx.audit.actions).toEqual(['USER_EMAIL_TOPICS_CHANGED', 'USER_EMAIL_TOPICS_CHANGED']);
      expect(fx.audit.entries[0]?.change.changes).toEqual([
        { field: 'noticesByEmail', before: true, after: false },
      ]);
    });

    it('records nothing when nothing changes', async () => {
      await change.execute((await userOf('u-502')).actor, 'NOTICES', true);

      expect(fx.audit.entries).toEqual([]);
    });
  });

  describe('EmailRecipients', () => {
    it('writes once to each confirmed address, naming its accounts', async () => {
      const sent = await recipients.of('NOTICES');

      expect(sent.map(({ address, accounts }) => ({ address, accounts }))).toEqual([
        { address: 'admin@ejemplo.mx', accounts: ['admin', '501'] },
        { address: 'vecina@ejemplo.mx', accounts: ['502'] },
      ]);
      expect(sent[0]?.unsubscribe.page).toMatch(/^\/email\/unsubscribe#u-admin\.NOTICES\./);
      expect(sent[0]?.unsubscribe.oneClick).toMatch(
        /^\/api\/email\/unsubscribe\/u-admin\.NOTICES\./,
      );
    });

    it('leaves out the author and every account sharing their address', async () => {
      const sent = await recipients.of('NOTICES', 'u-501');

      expect(sent.map(({ address }) => address)).toEqual(['vecina@ejemplo.mx']);
    });

    it('writes to nobody without a confirmed address, turned off, or unable to sign in', async () => {
      await given(await givenOwner(fx.users, UnitNumber.of(101), 'p 101'), (user) => {
        user.requestEmail('sin-confirmar@ejemplo.mx');
      });
      await given(await givenOwner(fx.users, UnitNumber.of(102), 'p 102'), (user) => {
        withEmail('apagado@ejemplo.mx')(user);
        user.receive('NOTICES', false);
      });
      await given(await givenOwner(fx.users, UnitNumber.of(201), 'p 201'), (user) => {
        withEmail('desactivado@ejemplo.mx')(user);
        user.disable();
      });
      await given(await givenOwner(fx.users, UnitNumber.of(202), 'p 202'), (user) => {
        withEmail('vencido@ejemplo.mx')(user);
        user.changeAccess({ unit: user.unit, expiresOn: LocalDate.parse('2026-10-12') });
      });
      await given(
        await givenOwner(fx.users, UnitNumber.of(301), null),
        withEmail('sin-clave@ejemplo.mx'),
      );

      const sent = await recipients.of('NOTICES');

      expect(sent.map(({ address }) => address)).toEqual(['admin@ejemplo.mx', 'vecina@ejemplo.mx']);
    });
  });

  describe('Unsubscribe', () => {
    const tokenFor = async (address: string) =>
      (await recipients.of('NOTICES'))
        .find((sent) => sent.address === address)!
        .unsubscribe.page.split('#')[1]!;

    it('stops the notices of every account of the address, without a session', async () => {
      const token = await tokenFor('admin@ejemplo.mx');

      expect(await unsubscribe.execute(token)).toEqual({
        topic: 'NOTICES',
        accounts: ['admin', '501'],
      });
      expect((await userOf('u-admin')).wants('NOTICES')).toBe(false);
      expect((await userOf('u-501')).wants('NOTICES')).toBe(false);
      expect((await userOf('u-502')).wants('NOTICES')).toBe(true);
      expect(fx.audit.entries.map(({ actor, change }) => [actor.userId, change.entityId])).toEqual([
        ['u-admin', 'u-admin'],
        ['u-admin', 'u-501'],
      ]);
    });

    it('answers the same when followed again, and records nothing more', async () => {
      const token = await tokenFor('vecina@ejemplo.mx');
      await unsubscribe.execute(token);

      expect(await unsubscribe.execute(token)).toEqual({ topic: 'NOTICES', accounts: ['502'] });
      expect(fx.audit.actions).toEqual(['USER_UNSUBSCRIBED']);
    });

    it('refuses a link changed by hand, or once the account has another address', async () => {
      const token = await tokenFor('vecina@ejemplo.mx');

      await expect(unsubscribe.execute(token.replace('u-502', 'u-501'))).rejects.toThrow(
        withCode('UNSUBSCRIBE_LINK_INVALID'),
      );
      await expect(unsubscribe.execute('nada')).rejects.toThrow(
        withCode('UNSUBSCRIBE_LINK_INVALID'),
      );
      await given(await userOf('u-502'), withEmail('nueva@ejemplo.mx'));
      await expect(unsubscribe.execute(token)).rejects.toThrow(
        withCode('UNSUBSCRIBE_LINK_INVALID'),
      );
      expect((await userOf('u-502')).wants('NOTICES')).toBe(true);
    });
  });
});
