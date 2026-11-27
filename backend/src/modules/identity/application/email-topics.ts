import { Inject, Injectable } from '@nestjs/common';
import {
  type Actor,
  AUDIT_TRAIL,
  type AuditTrail,
  CLOCK,
  type Clock,
  type EmailUnsubscribe,
  trackChanges,
  UNIT_OF_WORK,
  type UnitOfWork,
  ValidationError,
} from '../../../shared-kernel/index.js';
import {
  type EmailTopic,
  UNSUBSCRIBE_LINKS,
  type UnsubscribeLinks,
  type User,
  USER_REPOSITORY,
  type UserRepository,
} from '../domain/index.js';
import { unsubscribeFor } from './emails.js';
import { findUser } from './find-user.js';
import { USER_AUDIT, UserAuditAction } from './user-audit.js';

// The optional emails (ADR-0034): each account chooses in _Mi cuenta_, and every such email
// carries a signed link to stop them without signing in.

/** The signed-in account turns an optional email on or off, from _Mi cuenta_. */
@Injectable()
export class ChangeEmailTopic {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(AUDIT_TRAIL) private readonly audit: AuditTrail,
  ) {}

  execute(actor: Actor, topic: EmailTopic, receive: boolean): Promise<User> {
    return this.unitOfWork.run(async () => {
      const user = await findUser(this.users, actor.userId);
      const tracked = trackChanges(USER_AUDIT, user);
      if (!user.receive(topic, receive)) return user;
      await this.users.save(user);
      await this.audit.record(actor, tracked.change(UserAuditAction.EMAIL_TOPICS_CHANGED));
      return user;
    });
  }
}

export interface Unsubscribed {
  readonly topic: EmailTopic;
  /** Every account of the address the email went to, by username. */
  readonly accounts: readonly string[];
}

/**
 * The link at the foot of an optional email, without a session: whoever reads that mailbox
 * may stop what reaches it, so every account sharing the address stops getting the topic
 * (the administrator's 501 and superadmin, for one). Following it again changes nothing.
 * It is audited under the account the link names.
 */
@Injectable()
export class Unsubscribe {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(UNSUBSCRIBE_LINKS) private readonly links: UnsubscribeLinks,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(AUDIT_TRAIL) private readonly audit: AuditTrail,
  ) {}

  async execute(token: string): Promise<Unsubscribed> {
    const named = this.links.read(token);
    if (!named) throw invalidLink();
    const { topic } = named;
    return this.unitOfWork.run(async () => {
      const user = await this.users.findById(named.userId);
      const email = user?.email;
      if (!user || !email || !this.links.verify(token, { ...named, email })) throw invalidLink();
      const sharing = (await this.users.findAll()).filter((account) => account.email === email);
      for (const account of sharing) {
        const tracked = trackChanges(USER_AUDIT, account);
        if (!account.receive(topic, false)) continue;
        await this.users.save(account);
        await this.audit.record(user.actor, tracked.change(UserAuditAction.UNSUBSCRIBED));
      }
      return { topic, accounts: sharing.map((account) => account.username) };
    });
  }
}

const invalidLink = () =>
  new ValidationError('UNSUBSCRIBE_LINK_INVALID', 'The link is not valid for any address');

/** One email for one address. */
export interface EmailRecipient {
  readonly address: string;
  /** The accounts of that address that want the topic, by username. */
  readonly accounts: readonly string[];
  /** Signed for the first of them; following it stops all of them. */
  readonly unsubscribe: EmailUnsubscribe;
}

/**
 * Who gets an optional email today: the accounts that can sign in, with a confirmed address,
 * that did not turn the topic off. One email per address, so whoever has two accounts with
 * one address (the administrator) gets it once. `except` leaves out an account and every
 * other one sharing its address: the author of a notice does not get it.
 */
@Injectable()
export class EmailRecipients {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(UNSUBSCRIBE_LINKS) private readonly links: UnsubscribeLinks,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async of(topic: EmailTopic, except?: string): Promise<EmailRecipient[]> {
    const today = this.clock.today();
    const users = await this.users.findAll();
    const skipped = users.find((user) => user.id === except)?.email ?? null;
    const byAddress = new Map<string, User[]>();
    for (const user of users) {
      const { email } = user;
      if (!email || email === skipped || !user.canSignInOn(today) || !user.wants(topic)) continue;
      byAddress.set(email, [...(byAddress.get(email) ?? []), user]);
    }
    return [...byAddress].map(([address, accounts]) => ({
      address,
      accounts: accounts.map((user) => user.username),
      unsubscribe: unsubscribeFor(
        this.links.issue({ userId: accounts[0]!.id, topic, email: address }),
      ),
    }));
  }
}
