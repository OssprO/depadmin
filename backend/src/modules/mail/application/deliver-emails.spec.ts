import { Logger } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeUnitOfWork } from '../../../../test/support/audit-trail.js';
import { FixedClock } from '../../../../test/support/clock.js';
import type { OutgoingEmail } from '../../../shared-kernel/index.js';
import { DeliverEmails, describeDelivery, urgentReserve } from './deliver-emails.js';
import { EmailCourier } from './email-courier.js';
import { OutboxService } from './outbox-service.js';
import { DeliveryFailure, FakeEmailSender, InMemoryOutboxRepository } from './testing.js';

describe('the outbox', () => {
  let clock: FixedClock;
  let repository: InMemoryOutboxRepository;
  let sender: FakeEmailSender;
  let deliver: DeliverEmails;
  let courier: EmailCourier;
  let unitOfWork: FakeUnitOfWork;
  let outbox: OutboxService;

  const settings = { dailyLimit: 5 };

  beforeEach(() => {
    clock = new FixedClock();
    repository = new InMemoryOutboxRepository();
    sender = new FakeEmailSender();
    deliver = new DeliverEmails(repository, sender, settings, clock);
    courier = new EmailCourier(deliver);
    unitOfWork = new FakeUnitOfWork();
    outbox = new OutboxService(repository, sender, unitOfWork, clock, courier);
  });

  const email = (to: string, changes: Partial<OutgoingEmail> = {}): OutgoingEmail => ({
    kind: 'NOTICE',
    to,
    subject: 'Aviso',
    paragraphs: ['Hola.'],
    action: null,
    urgent: false,
    sendBy: clock.now().plusDays(3),
    ...changes,
  });

  /** Enqueued as a use case does it, inside a unit of work. */
  const enqueue = (message: OutgoingEmail) => unitOfWork.run(() => outbox.enqueue(message));

  describe('OutboxService', () => {
    it('sends right after the unit of work commits', async () => {
      await enqueue(email('a@ejemplo.mx'));
      await courier.idle();

      expect(sender.sent.map((sent) => sent.to)).toEqual(['a@ejemplo.mx']);
      expect([...repository.rows.values()][0]?.status).toBe('SENT');
    });

    it('sends nothing when the unit of work fails', async () => {
      await expect(
        unitOfWork.run(async () => {
          await outbox.enqueue(email('a@ejemplo.mx'));
          throw new Error('rolled back');
        }),
      ).rejects.toThrow('rolled back');
      await courier.idle();

      expect(sender.sent).toEqual([]);
    });

    it('says whether emails go out now', () => {
      expect(outbox.delivers).toBe(true);
      sender.configured = false;
      expect(outbox.delivers).toBe(false);
    });
  });

  describe('DeliverEmails', () => {
    it('sends urgent ones first, then the oldest, within the daily limit', async () => {
      sender.configured = false;
      for (const to of ['1@e.mx', '2@e.mx', '3@e.mx', '4@e.mx']) {
        await enqueue(email(to));
        clock.advanceSeconds(1);
      }
      await enqueue(email('urgente@e.mx', { urgent: true }));
      await enqueue(email('5@e.mx'));
      await enqueue(email('6@e.mx'));
      await courier.idle();
      sender.configured = true;

      const report = await deliver.execute();

      // The last of the 5 waits for an urgent email.
      expect(sender.sent.map((sent) => sent.to)).toEqual([
        'urgente@e.mx',
        '1@e.mx',
        '2@e.mx',
        '3@e.mx',
      ]);
      expect(report).toMatchObject({ sent: 4, waiting: 3, limited: true });
      expect(describeDelivery(report)).toBe('Emails: sent 4; the daily limit holds 3 back');

      clock.advanceDays(1);
      await deliver.execute();
      expect(sender.sent).toHaveLength(7);
    });

    it('keeps the last emails of the day for the urgent ones (ADR-0034)', async () => {
      for (const to of ['1@e.mx', '2@e.mx', '3@e.mx', '4@e.mx', '5@e.mx']) {
        await enqueue(email(to));
        await courier.idle();
      }
      expect(sender.sent).toHaveLength(4);

      await enqueue(email('recuperacion@e.mx', { urgent: true }));
      await courier.idle();

      expect(sender.sent.map((sent) => sent.to).at(-1)).toBe('recuperacion@e.mx');
      expect(await deliver.execute()).toMatchObject({ sent: 0, waiting: 1, limited: true });
    });

    it('reserves 10 of the 90 a day for them, less under a smaller limit', () => {
      expect([90, 20, 5, 3].map(urgentReserve)).toEqual([10, 5, 1, 0]);
    });

    it('keeps everything waiting without a provider, except what expires', async () => {
      sender.configured = false;
      await enqueue(email('pronto@e.mx', { sendBy: clock.now().plusSeconds(60) }));
      await enqueue(email('luego@e.mx'));
      clock.advanceSeconds(60);

      const report = await deliver.execute();

      expect(report).toMatchObject({ sent: 0, expired: 1, waiting: 1, limited: false });
      expect(describeDelivery(report)).toBe('Emails: 1 expired unsent; 1 waiting');
    });

    it('retries what the provider did not take, and gives up what it refused', async () => {
      sender.configured = false;
      await enqueue(email('red@e.mx'));
      await enqueue(email('rechazado@e.mx'));
      await courier.idle();
      sender.configured = true;
      let attempt = 0;
      sender.send = (message) => {
        attempt++;
        if (message.to === 'rechazado@e.mx') {
          return Promise.reject(new DeliveryFailure('EENVELOPE 550', true));
        }
        return attempt < 3 ? Promise.reject(new Error('ETIMEDOUT')) : Promise.resolve();
      };

      const first = await deliver.execute();
      expect(first).toMatchObject({ sent: 0, retrying: 1, failed: 1, waiting: 1 });
      expect(describeDelivery(first)).toBe(
        'Emails: 1 failed and will be retried; 1 failed for good',
      );

      // Not before its wait of a minute.
      await deliver.execute();
      expect(attempt).toBe(2);
      clock.advanceSeconds(60);
      expect(await deliver.execute()).toMatchObject({ sent: 1, waiting: 0 });
    });

    it('drops a claimed email whose link expired before its turn', async () => {
      sender.configured = false;
      await enqueue(email('tarde@e.mx', { sendBy: clock.now().plusSeconds(1) }));
      await courier.idle();
      sender.configured = true;
      let late = false;
      const now = clock.now.bind(clock);
      clock.now = () => (late ? now().plusSeconds(5) : now());
      repository.claimDue = (
        (claim) =>
        async (...args) => {
          const batch = await claim(...args);
          late = true;
          return batch;
        }
      )(repository.claimDue.bind(repository));

      expect(await deliver.execute()).toMatchObject({ sent: 0, expired: 1 });
      expect(sender.sent).toEqual([]);
    });

    it('forgets, after 30 days, what stopped being pending', async () => {
      await enqueue(email('a@e.mx'));
      await courier.idle();
      clock.advanceDays(31);

      await deliver.execute();

      expect(repository.rows.size).toBe(0);
    });

    it('reports nothing when there was nothing to do', async () => {
      expect(describeDelivery(await deliver.execute())).toBeNull();
    });
  });

  describe('EmailCourier', () => {
    it('runs once more when woken during a run, and never throws', async () => {
      const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      let runs = 0;
      let release: () => void = () => undefined;
      const slow = {
        execute: () => {
          runs++;
          return runs === 1
            ? new Promise<never>((_, reject) => {
                release = () => reject(new Error('SMTP down'));
              })
            : Promise.resolve({
                sent: 0,
                retrying: 0,
                failed: 0,
                expired: 0,
                waiting: 0,
                limited: false,
              });
        },
      } as unknown as DeliverEmails;
      const waking = new EmailCourier(slow);

      waking.wake();
      waking.wake();
      waking.wake();
      release();
      await waking.onModuleDestroy();

      expect(runs).toBe(2);
      expect(logged).toHaveBeenCalledWith('Could not deliver the outbox', expect.any(Error));
    });
  });
});
