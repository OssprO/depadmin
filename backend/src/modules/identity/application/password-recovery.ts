import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  AUDIT_TRAIL,
  type AuditTrail,
  CLOCK,
  type Clock,
  ConflictError,
  type Instant,
  OUTBOX,
  type Outbox,
  trackChanges,
  UNIT_OF_WORK,
  type UnitOfWork,
} from '../../../shared-kernel/index.js';
import {
  LINKS_PER_HOUR,
  PASSWORD_HASHER,
  type PasswordHasher,
  REFRESH_TOKEN_REPOSITORY,
  type RefreshTokenRepository,
  SECRET_GENERATOR,
  type SecretGenerator,
  type User,
  USER_REPOSITORY,
  USER_TOKEN_REPOSITORY,
  type UserRepository,
  UserToken,
  type UserTokenRepository,
} from '../domain/index.js';
import { passwordChangedEmail, recoveryEmail } from './emails.js';
import { USER_AUDIT, UserAuditAction } from './user-audit.js';

const HOUR_SECONDS = 60 * 60;

/** Whether «¿Olvidaste tu contraseña?» can work: only with a provider to send the link. */
@Injectable()
export class PasswordRecoveryAvailability {
  constructor(@Inject(OUTBOX) private readonly outbox: Outbox) {}

  execute(): boolean {
    return this.outbox.delivers;
  }
}

/**
 * «¿Olvidaste tu contraseña?» (ADR-0033). Sends a link to the user's confirmed email, if they
 * can sign in today and were not sent `LINKS_PER_HOUR` in the last hour; a new link replaces
 * the earlier one. It answers the same in every case, so nobody learns which usernames
 * exist or have an email; that is also why the hourly limit is silent.
 */
@Injectable()
export class RequestPasswordRecovery {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(USER_TOKEN_REPOSITORY) private readonly tokens: UserTokenRepository,
    @Inject(SECRET_GENERATOR) private readonly secrets: SecretGenerator,
    @Inject(OUTBOX) private readonly outbox: Outbox,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(username: string): Promise<void> {
    // Without a provider the link would wait longer than it lasts.
    if (!this.outbox.delivers) return;
    const user = await this.users.findByUsername(username);
    const email = user?.email;
    if (!user || !email || !user.canSignInOn(this.clock.today())) return;
    const now = this.clock.now();
    await this.unitOfWork.run(async () => {
      const sent = await this.tokens.countIssuedSince(
        user.id,
        'PASSWORD_RECOVERY',
        now.plusSeconds(-HOUR_SECONDS),
      );
      if (sent >= LINKS_PER_HOUR) return;
      await this.tokens.revokeActive(user.id, 'PASSWORD_RECOVERY', now);
      const { token, tokenHash } = this.secrets.linkToken();
      const link = UserToken.passwordRecovery({ id: randomUUID(), tokenHash }, user.id, now);
      await this.tokens.add(link);
      await this.outbox.enqueue(recoveryEmail(user, email, token, link.expiresAt));
    });
  }
}

/** Finds the user a recovery link works for, or says it does not. */
async function recoveringUser(
  token: string,
  deps: { tokens: UserTokenRepository; users: UserRepository; secrets: SecretGenerator },
  clock: Clock,
): Promise<{ link: UserToken; user: User }> {
  const link = await deps.tokens.findByHash(deps.secrets.hashLinkToken(token));
  if (!link?.worksFor('PASSWORD_RECOVERY', clock.now())) throw invalidLink();
  const user = await deps.users.findById(link.userId);
  // Deactivated or expired after asking: the link no longer opens anything.
  if (!user?.canSignInOn(clock.today())) throw invalidLink();
  return { link, user };
}

/**
 * Whether a recovery link still works, before its holder types a new password; it answers
 * with the account, since one person may have two. It does not use the link.
 */
@Injectable()
export class CheckRecoveryLink {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(USER_TOKEN_REPOSITORY) private readonly tokens: UserTokenRepository,
    @Inject(SECRET_GENERATOR) private readonly secrets: SecretGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(token: string): Promise<{ username: string }> {
    const { tokens, users, secrets } = this;
    const { user } = await recoveringUser(token, { tokens, users, secrets }, this.clock);
    return { username: user.username };
  }
}

/**
 * The holder of a recovery link chooses a new password. The link is used up, every session
 * of the account ends, the log records it under the user, and their email is told.
 */
@Injectable()
export class RecoverPassword {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(USER_TOKEN_REPOSITORY) private readonly tokens: UserTokenRepository,
    @Inject(SECRET_GENERATOR) private readonly secrets: SecretGenerator,
    @Inject(REFRESH_TOKEN_REPOSITORY) private readonly refreshTokens: RefreshTokenRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(OUTBOX) private readonly outbox: Outbox,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(AUDIT_TRAIL) private readonly audit: AuditTrail,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(token: string, newPassword: string): Promise<void> {
    const { tokens, users, secrets } = this;
    const { link, user } = await recoveringUser(token, { tokens, users, secrets }, this.clock);
    const now = this.clock.now();
    const tracked = trackChanges(USER_AUDIT, user);
    user.changePassword(await this.hasher.hash(newPassword));
    await this.unitOfWork.run(async () => {
      if (!(await this.tokens.use(link, now))) throw invalidLink();
      await this.users.save(user);
      await this.audit.record(user.actor, tracked.change(UserAuditAction.PASSWORD_RECOVERED));
      await this.refreshTokens.revokeAllOf(user.id, now);
      await notifyPasswordChange(this.outbox, user, now);
    });
  }
}

/** Tells the account's confirmed email that its password changed, if it has one. */
export async function notifyPasswordChange(
  outbox: Outbox,
  user: User,
  now: Instant,
): Promise<void> {
  if (user.email) await outbox.enqueue(passwordChangedEmail(user, user.email, now));
}

const invalidLink = () =>
  new ConflictError('RECOVERY_LINK_INVALID', 'The recovery link expired, was used or replaced');
