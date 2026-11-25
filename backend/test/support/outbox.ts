import type { OutgoingEmail, Outbox } from '../../src/shared-kernel/index.js';
import type { FakeUnitOfWork } from './audit-trail.js';

/** The outbox for use case specs: what was enqueued, dropped if the unit of work fails. */
export class RecordingOutbox implements Outbox {
  readonly emails: OutgoingEmail[] = [];
  delivers = true;

  constructor(private readonly unitOfWork: FakeUnitOfWork) {}

  enqueue(email: OutgoingEmail): Promise<void> {
    this.unitOfWork.onCommit(() => this.emails.push(email));
    return Promise.resolve();
  }

  /** The secret of the last link sent to `to`, as the email carries it after the `#`. */
  linkSentTo(to: string): string {
    const email = this.emails.findLast((sent) => sent.to === to && sent.action);
    const token = email?.action?.path.split('#')[1];
    if (!token) throw new Error(`No link was sent to ${to}`);
    return token;
  }
}
