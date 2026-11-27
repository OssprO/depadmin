import { beforeEach, describe, expect, it } from 'vitest';
import { FakeUnitOfWork, RecordingAuditTrail } from '../../../../test/support/audit-trail.js';
import { FixedClock } from '../../../../test/support/clock.js';
import { withCode } from '../../../../test/support/domain-error.js';
import { RecordingOutbox } from '../../../../test/support/outbox.js';
import { FakeShiftRoster } from '../../../../test/support/shift-roster.js';
import { type Actor, LocalDate, UnitNumber } from '../../../shared-kernel/index.js';
import { EmailRecipients } from '../../identity/application/index.js';
import {
  givenOwner,
  givenSuperadmin,
  InMemoryUserRepository,
} from '../../identity/application/testing.js';
import { HmacUnsubscribeLinks } from '../../identity/infrastructure/hmac-unsubscribe-links.js';
import type { NoticeContent } from '../domain/index.js';
import { ListNotices, MarkNoticesRead, PublishNotice, WithdrawNotice } from './notices.js';
import { InMemoryNoticeRepository } from './testing.js';

describe('notices (ADR-0034)', () => {
  let clock: FixedClock;
  let users: InMemoryUserRepository;
  let notices: InMemoryNoticeRepository;
  let unitOfWork: FakeUnitOfWork;
  let audit: RecordingAuditTrail;
  let outbox: RecordingOutbox;
  let publish: PublishNotice;
  let withdraw: WithdrawNotice;
  let list: ListNotices;
  let markRead: MarkNoticesRead;
  let admin: Actor;
  let o401: Actor;
  let o501: Actor;
  let tenant: Actor;

  const water: NoticeContent = {
    title: 'Corte de agua',
    body: 'El jueves de 9 a 14.\n\nLlenen sus tinacos.',
    expiresOn: LocalDate.parse('2026-12-03'),
  };

  beforeEach(async () => {
    clock = FixedClock.on('2026-12-01');
    users = new InMemoryUserRepository();
    notices = new InMemoryNoticeRepository();
    unitOfWork = new FakeUnitOfWork();
    audit = new RecordingAuditTrail(unitOfWork);
    outbox = new RecordingOutbox(unitOfWork);
    // December is 401's.
    const roster = new FakeShiftRoster({ '2026-12': [401] });
    const links = new HmacUnsubscribeLinks('a-secret-of-at-least-thirty-two-characters');
    const recipients = new EmailRecipients(users, links, clock);
    publish = new PublishNotice(notices, roster, recipients, outbox, unitOfWork, audit, clock);
    withdraw = new WithdrawNotice(notices, roster, unitOfWork, audit, clock);
    list = new ListNotices(notices, roster, clock);
    markRead = new MarkNoticesRead(notices, unitOfWork, clock);

    const withEmail = async (
      user: Awaited<ReturnType<typeof givenOwner>>,
      address: string,
    ): Promise<Actor> => {
      user.confirmEmail(user.requestEmail(address));
      await users.save(user);
      return user.actor;
    };
    admin = await withEmail(await givenSuperadmin(users), 'admin@ejemplo.mx');
    o501 = await withEmail(await givenOwner(users, UnitNumber.of(501), 'p'), 'admin@ejemplo.mx');
    o401 = await withEmail(await givenOwner(users, UnitNumber.of(401), 'p'), 'cuatro@ejemplo.mx');
    await withEmail(await givenOwner(users, UnitNumber.of(502), 'p'), 'cinco@ejemplo.mx');
    tenant = { role: 'READER', userId: 'u-inquilino', unit: UnitNumber.of(302) };
  });

  describe('PublishNotice', () => {
    it('lets the shift administrator publish, audited, and emails everyone else', async () => {
      const notice = await publish.execute(o401, water);

      expect(notice.author).toEqual(o401);
      expect(audit.entries).toMatchObject([
        { actor: o401, change: { action: 'NOTICE_PUBLISHED', entity: 'notice' } },
      ]);
      expect(outbox.emails.map(({ to }) => to)).toEqual(['admin@ejemplo.mx', 'cinco@ejemplo.mx']);
      const [toAdmin] = outbox.emails;
      expect(toAdmin).toMatchObject({
        kind: 'NOTICE',
        subject: 'Aviso: Corte de agua',
        paragraphs: [
          'El administrador en turno (depto 401) publicó este aviso en DepAdmin, la app de tu edificio:',
          '«Corte de agua»',
          'El jueves de 9 a 14.',
          'Llenen sus tinacos.',
          'Vigente hasta el 3 de diciembre de 2026.',
          'Te llega por las cuentas «admin» y «501». Puedes dejar de recibir los avisos por correo en «Mi cuenta», o con el enlace del final.',
        ],
        action: { label: 'Ver los avisos', path: '/notices' },
        urgent: false,
        // It expires on the 3rd: by the 4th, or not at all.
        sendBy: clock.now().plusDays(3),
      });
      expect(toAdmin?.unsubscribe?.page).toMatch(/^\/email\/unsubscribe#u-admin\.NOTICES\./);
    });

    it('lets the superadmin publish too, and leaves out every account of its address', async () => {
      await publish.execute(admin, { ...water, expiresOn: LocalDate.parse('2026-12-01') });

      expect(outbox.emails.map(({ to }) => to)).toEqual(['cuatro@ejemplo.mx', 'cinco@ejemplo.mx']);
      expect(outbox.emails[0]?.paragraphs[0]).toBe(
        'El superadmin publicó este aviso en DepAdmin, la app de tu edificio:',
      );
      // Its last day is today: by tomorrow, or not at all.
      expect(outbox.emails[0]?.sendBy).toEqual(clock.now().plusDays(1));
    });

    it('lets neither another owner nor a reader publish', async () => {
      await expect(publish.execute(o501, water)).rejects.toThrow(withCode('SHIFT_ADMIN_ONLY'));
      await expect(publish.execute(tenant, water)).rejects.toThrow(withCode('READ_ONLY'));

      expect(notices.rows.size).toBe(0);
      expect(outbox.emails).toEqual([]);
    });

    it('sends nothing when the publishing fails', async () => {
      notices.add = () => Promise.reject(new Error('database down'));

      await expect(publish.execute(o401, water)).rejects.toThrow('database down');
      expect(outbox.emails).toEqual([]);
      expect(audit.entries).toEqual([]);
    });
  });

  describe('ListNotices and MarkNoticesRead', () => {
    it('keeps each account its own reads, and counts the current ones unread', async () => {
      const first = await publish.execute(o401, water);
      clock.advanceSeconds(60);
      await publish.execute(o401, { title: 'Junta', body: 'El sábado a las 10.', expiresOn: null });

      const forTenant = await list.execute(tenant);
      expect(forTenant).toMatchObject({ canPublish: false, unread: 2 });
      expect(forTenant.notices.map(({ notice }) => notice.title)).toEqual([
        'Junta',
        'Corte de agua',
      ]);

      await markRead.execute(tenant, [first.id]);
      expect((await list.execute(tenant)).unread).toBe(1);
      // The author read them as they wrote them; 501 has not.
      expect(await list.execute(o401)).toMatchObject({ canPublish: true, unread: 0 });
      expect(await list.execute(o501)).toMatchObject({ canPublish: false, unread: 2 });
      expect(await list.execute(admin)).toMatchObject({ canPublish: true, unread: 2 });
    });

    it('stops counting a notice after its last day, though it is still listed', async () => {
      await publish.execute(o401, water);
      clock.advanceDays(3);

      const board = await list.execute(tenant);

      expect(board.unread).toBe(0);
      expect(board.notices).toMatchObject([{ current: false, read: false }]);
    });
  });

  describe('WithdrawNotice', () => {
    it('hides it from everyone, audited, by the shift administrator or the superadmin', async () => {
      const first = await publish.execute(o401, water);
      const second = await publish.execute(admin, water);

      await withdraw.execute(admin, first.id);
      await withdraw.execute(o401, second.id);

      expect((await list.execute(tenant)).notices).toEqual([]);
      expect(audit.actions.slice(2)).toEqual(['NOTICE_WITHDRAWN', 'NOTICE_WITHDRAWN']);
      expect(audit.entries[2]?.change.changes).toEqual([
        { field: 'withdrawn', before: false, after: true },
      ]);
    });

    it('lets nobody else withdraw it, and answers 404 for one already withdrawn', async () => {
      const notice = await publish.execute(o401, water);

      await expect(withdraw.execute(o501, notice.id)).rejects.toThrow(withCode('SHIFT_ADMIN_ONLY'));
      await expect(withdraw.execute(tenant, notice.id)).rejects.toThrow(withCode('READ_ONLY'));
      await withdraw.execute(o401, notice.id);
      await expect(withdraw.execute(o401, notice.id)).rejects.toThrow(withCode('NOTICE_NOT_FOUND'));
      await expect(withdraw.execute(o401, 'n-none')).rejects.toThrow(withCode('NOTICE_NOT_FOUND'));
    });
  });
});
