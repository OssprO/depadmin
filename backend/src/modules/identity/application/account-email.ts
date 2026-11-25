import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  type Actor,
  AUDIT_TRAIL,
  type AuditTrail,
  CLOCK,
  type Clock,
  ConflictError,
  ForbiddenError,
  OUTBOX,
  type Outbox,
  trackChanges,
  UNIT_OF_WORK,
  type UnitOfWork,
  WriteAccessPolicy,
} from '../../../shared-kernel/index.js';
import {
  LINKS_PER_HOUR,
  SECRET_GENERATOR,
  type SecretGenerator,
  type User,
  USER_REPOSITORY,
  USER_TOKEN_REPOSITORY,
  type UserRepository,
  UserToken,
  type UserTokenRepository,
} from '../domain/index.js';
import { confirmationEmail, emailChangedEmail } from './emails.js';
import { findUser } from './find-user.js';
import { USER_AUDIT, UserAuditAction } from './user-audit.js';

const HOUR_SECONDS = 60 * 60;
const policy = new WriteAccessPolicy();

/**
 * A user's email (ADR-0033): their own, from _Mi cuenta_, or anyone's, by the superadmin from
 * the building's list. A new address gets a confirmation link and waits for it; `null` takes
 * every address away. Asking again for the address that waits sends a new link, which
 * replaces the earlier one; at most `LINKS_PER_HOUR` an hour.
 */
@Injectable()
export class ChangeEmail {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(USER_TOKEN_REPOSITORY) private readonly tokens: UserTokenRepository,
    @Inject(SECRET_GENERATOR) private readonly secrets: SecretGenerator,
    @Inject(OUTBOX) private readonly outbox: Outbox,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(AUDIT_TRAIL) private readonly audit: AuditTrail,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(actor: Actor, userId: string, address: string | null): Promise<User> {
    // Managing someone else's access is the superadmin's (ADR-0031), not a building decision.
    if (actor.userId !== userId) policy.assertCanAdminister(actor);
    const now = this.clock.now();
    return this.unitOfWork.run(async () => {
      const user = await findUser(this.users, userId);
      const tracked = trackChanges(USER_AUDIT, user);
      if (address === null) {
        user.removeEmail();
        await this.tokens.revokeActive(user.id, 'EMAIL_CONFIRMATION', now);
        await this.users.save(user);
        await this.audit.record(actor, tracked.change(UserAuditAction.EMAIL_REMOVED));
        return user;
      }
      const sent = await this.tokens.countIssuedSince(
        user.id,
        'EMAIL_CONFIRMATION',
        now.plusSeconds(-HOUR_SECONDS),
      );
      if (sent >= LINKS_PER_HOUR) {
        throw new ConflictError(
          'EMAIL_CONFIRMATION_LIMIT',
          `${user.username} was sent ${sent} confirmation links this hour`,
        );
      }
      const waiting = user.pendingEmail;
      const email = user.requestEmail(address);
      await this.tokens.revokeActive(user.id, 'EMAIL_CONFIRMATION', now);
      const { token, tokenHash } = this.secrets.linkToken();
      const link = UserToken.emailConfirmation(
        { id: randomUUID(), tokenHash },
        user.id,
        email,
        now,
      );
      await this.tokens.add(link);
      await this.users.save(user);
      // Sending the same address again changes nothing the log keeps.
      if (email !== waiting) {
        await this.audit.record(actor, tracked.change(UserAuditAction.EMAIL_REQUESTED));
      }
      await this.outbox.enqueue(confirmationEmail(user, email, token, link.expiresAt));
      return user;
    });
  }
}

/**
 * The user followed the link sent to their new address, signed in as themselves: a stranger
 * who got the email by a typo cannot confirm it without the account's password. The address
 * it replaces is told. Following the link again just answers that it is confirmed.
 */
@Injectable()
export class ConfirmEmail {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(USER_TOKEN_REPOSITORY) private readonly tokens: UserTokenRepository,
    @Inject(SECRET_GENERATOR) private readonly secrets: SecretGenerator,
    @Inject(OUTBOX) private readonly outbox: Outbox,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(AUDIT_TRAIL) private readonly audit: AuditTrail,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(actor: Actor, token: string): Promise<User> {
    const now = this.clock.now();
    const link = await this.tokens.findByHash(this.secrets.hashLinkToken(token));
    if (!link || link.purpose !== 'EMAIL_CONFIRMATION' || !link.email) throw invalidLink();
    if (link.userId !== actor.userId) {
      throw new ForbiddenError('EMAIL_LINK_OTHER_ACCOUNT', 'The link is for another account');
    }
    const email = link.email;
    return this.unitOfWork.run(async () => {
      const user = await findUser(this.users, actor.userId);
      const state = link.stateAt(now);
      if (state === 'USED' && user.email === email) return user;
      if (state !== 'ACTIVE') throw invalidLink();
      const tracked = trackChanges(USER_AUDIT, user);
      const previous = user.confirmEmail(email);
      if (!(await this.tokens.use(link, now))) throw invalidLink();
      await this.users.save(user);
      await this.audit.record(actor, tracked.change(UserAuditAction.EMAIL_CONFIRMED));
      if (previous && previous !== email) {
        await this.outbox.enqueue(emailChangedEmail(user, previous, now));
      }
      return user;
    });
  }
}

const invalidLink = () =>
  new ConflictError('EMAIL_LINK_INVALID', 'The confirmation link expired or was replaced');
