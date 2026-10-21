import { Inject, Injectable } from '@nestjs/common';
import {
  type Actor,
  AUDIT_TRAIL,
  type AuditTrail,
  CLOCK,
  type Clock,
  UNIT_OF_WORK,
  type UnitOfWork,
  trackChanges,
  ValidationError,
} from '../../../shared-kernel/index.js';
import {
  PASSWORD_HASHER,
  type PasswordHasher,
  REFRESH_TOKEN_REPOSITORY,
  type RefreshTokenRepository,
  USER_REPOSITORY,
  type UserRepository,
} from '../domain/index.js';
import { findUser } from './find-user.js';
import { type IssuedSession, SessionIssuer } from './session-issuer.js';
import { USER_AUDIT, UserAuditAction } from './user-audit.js';

export interface ChangePasswordCommand {
  readonly currentPassword: string;
  readonly newPassword: string;
}

/**
 * The user replaces their own password (also the temporary one after a reset). Every other
 * session of theirs ends, in case the old password leaked; this device gets a new one.
 */
@Injectable()
export class ChangePassword {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(REFRESH_TOKEN_REPOSITORY) private readonly refreshTokens: RefreshTokenRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(AUDIT_TRAIL) private readonly audit: AuditTrail,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly sessions: SessionIssuer,
  ) {}

  async execute(actor: Actor, command: ChangePasswordCommand): Promise<IssuedSession> {
    const user = await findUser(this.users, actor.userId);
    const { currentPassword, newPassword } = command;
    if (!user.passwordHash || !(await this.hasher.verify(user.passwordHash, currentPassword))) {
      throw new ValidationError('CURRENT_PASSWORD_INCORRECT', 'The current password is wrong');
    }
    if (newPassword === currentPassword) {
      throw new ValidationError('PASSWORD_UNCHANGED', 'The new password equals the current one');
    }
    const tracked = trackChanges(USER_AUDIT, user);
    user.changePassword(await this.hasher.hash(newPassword));

    return this.unitOfWork.run(async () => {
      await this.users.save(user);
      await this.audit.record(actor, tracked.change(UserAuditAction.PASSWORD_CHANGED));
      await this.refreshTokens.revokeAllOf(user.id, this.clock.now());
      return this.sessions.start(user);
    });
  }
}
