import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  type Actor,
  AUDIT_TRAIL,
  type AuditTrail,
  CLOCK,
  type Clock,
  ConflictError,
  creationOf,
  trackChanges,
  UNIT_OF_WORK,
  type UnitOfWork,
  ValidationError,
  WriteAccessPolicy,
} from '../../../shared-kernel/index.js';
import {
  PASSWORD_HASHER,
  type PasswordHasher,
  REFRESH_TOKEN_REPOSITORY,
  type RefreshTokenRepository,
  SECRET_GENERATOR,
  type SecretGenerator,
  User,
  type UserAccess,
  USER_REPOSITORY,
  type UserRepository,
} from '../domain/index.js';
import { findUser } from './find-user.js';
import { USER_AUDIT, UserAuditAction } from './user-audit.js';

// The superadmin manages who else can get in (ADR-0025): read-only users (a tenant, a
// relative, an accountant), how long anyone's access lasts, and switching it off and on.
// Every change goes to the audit log; ending someone's access ends their sessions too.

const policy = new WriteAccessPolicy();

/** An expiry is a day from today on: to end access now, deactivate the user instead. */
function assertExpiryAhead(access: UserAccess, clock: Clock): void {
  if (access.expiresOn?.isBefore(clock.today())) {
    throw new ValidationError(
      'USER_EXPIRY_PAST',
      `The access cannot end on ${access.expiresOn}, which is past`,
    );
  }
}

export interface NewReader extends UserAccess {
  readonly username: string;
}

/** A read-only user, with a temporary password to hand over in person or by chat. */
@Injectable()
export class CreateReader {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(SECRET_GENERATOR) private readonly secrets: SecretGenerator,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(AUDIT_TRAIL) private readonly audit: AuditTrail,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(
    actor: Actor,
    reader: NewReader,
  ): Promise<{ user: User; temporaryPassword: string }> {
    policy.assertCanAdminister(actor);
    assertExpiryAhead(reader, this.clock);
    const temporaryPassword = this.secrets.temporaryPassword();
    const user = User.createReader(
      randomUUID(),
      reader.username,
      reader,
      await this.hasher.hash(temporaryPassword),
    );
    await this.unitOfWork.run(async () => {
      if (await this.users.findByUsername(user.username)) {
        throw new ConflictError('USERNAME_TAKEN', `The username ${user.username} is taken`);
      }
      await this.users.save(user);
      await this.audit.record(actor, creationOf(USER_AUDIT, UserAuditAction.CREATED, user));
    });
    return { user, temporaryPassword };
  }
}

/**
 * A user's depto (read-only users only) and expiry. The new expiry is today or later, so it
 * ends no session now; the sessions end on their own once it passes.
 */
@Injectable()
export class ChangeUserAccess {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(AUDIT_TRAIL) private readonly audit: AuditTrail,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(actor: Actor, userId: string, access: UserAccess): Promise<User> {
    policy.assertCanAdminister(actor);
    assertExpiryAhead(access, this.clock);
    return this.unitOfWork.run(async () => {
      const user = await findUser(this.users, userId);
      const tracked = trackChanges(USER_AUDIT, user);
      user.changeAccess(access);
      await this.users.save(user);
      await this.audit.record(actor, tracked.change(UserAuditAction.ACCESS_CHANGED));
      return user;
    });
  }
}

/** Switches a user off: they cannot sign in, and their sessions end now. */
@Injectable()
export class DisableUser {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(REFRESH_TOKEN_REPOSITORY) private readonly refreshTokens: RefreshTokenRepository,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(AUDIT_TRAIL) private readonly audit: AuditTrail,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(actor: Actor, userId: string): Promise<User> {
    policy.assertCanAdminister(actor);
    return this.unitOfWork.run(async () => {
      const user = await findUser(this.users, userId);
      const tracked = trackChanges(USER_AUDIT, user);
      user.disable();
      await this.users.save(user);
      await this.audit.record(actor, tracked.change(UserAuditAction.DISABLED));
      await this.refreshTokens.revokeAllOf(user.id, this.clock.now());
      return user;
    });
  }
}

/** Switches a user back on, with the password they had. */
@Injectable()
export class EnableUser {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(AUDIT_TRAIL) private readonly audit: AuditTrail,
  ) {}

  async execute(actor: Actor, userId: string): Promise<User> {
    policy.assertCanAdminister(actor);
    return this.unitOfWork.run(async () => {
      const user = await findUser(this.users, userId);
      const tracked = trackChanges(USER_AUDIT, user);
      user.enable();
      await this.users.save(user);
      await this.audit.record(actor, tracked.change(UserAuditAction.ENABLED));
      return user;
    });
  }
}
