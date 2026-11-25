import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { DeliverEmails, describeDelivery } from './deliver-emails.js';

/**
 * Sends the outbox right after something is enqueued, so a recovery link arrives in seconds
 * instead of at the next run of the job. One run at a time: a wake during a run makes it go
 * once more at the end. Nobody waits for it, and it never throws; the job retries.
 */
@Injectable()
export class EmailCourier implements OnModuleDestroy {
  private readonly logger = new Logger(EmailCourier.name);
  private running: Promise<void> | null = null;
  private again = false;

  constructor(private readonly deliver: DeliverEmails) {}

  wake(): void {
    if (this.running) {
      this.again = true;
      return;
    }
    this.running = this.loop().finally(() => {
      this.running = null;
    });
  }

  /** Resolves once the current run, if any, is over. */
  idle(): Promise<void> {
    return this.running ?? Promise.resolve();
  }

  /** The API does not stop in the middle of a send. */
  onModuleDestroy(): Promise<void> {
    return this.idle();
  }

  private async loop(): Promise<void> {
    do {
      this.again = false;
      try {
        const done = describeDelivery(await this.deliver.execute());
        if (done) this.logger.log(done);
      } catch (error) {
        this.logger.error('Could not deliver the outbox', error);
      }
    } while (this.again);
  }
}
