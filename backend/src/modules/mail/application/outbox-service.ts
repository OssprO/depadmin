import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  CLOCK,
  type Clock,
  type OutgoingEmail,
  type Outbox,
  UNIT_OF_WORK,
  type UnitOfWork,
} from '../../../shared-kernel/index.js';
import {
  EMAIL_SENDER,
  type EmailSender,
  OUTBOX_REPOSITORY,
  OutboxMessage,
  type OutboxRepository,
} from '../domain/index.js';
import { EmailCourier } from './email-courier.js';

/**
 * The `OUTBOX` every module writes to (ADR-0033): the email is stored in the caller's unit of
 * work, and the courier wakes once it commits, so a rolled-back change sends nothing.
 */
@Injectable()
export class OutboxService implements Outbox {
  constructor(
    @Inject(OUTBOX_REPOSITORY) private readonly outbox: OutboxRepository,
    @Inject(EMAIL_SENDER) private readonly sender: EmailSender,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly courier: EmailCourier,
  ) {}

  get delivers(): boolean {
    return this.sender.configured;
  }

  async enqueue(email: OutgoingEmail): Promise<void> {
    await this.outbox.add(OutboxMessage.enqueue(randomUUID(), email, this.clock.now()));
    this.unitOfWork.afterCommit(() => this.courier.wake());
  }
}
