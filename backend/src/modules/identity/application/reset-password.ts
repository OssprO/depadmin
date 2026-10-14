import { Inject, Injectable } from '@nestjs/common';
import {
  type Actor,
  CLOCK,
  type Clock,
  UNIT_OF_WORK,
  type UnitOfWork,
  ValidationError,
} from '../../../shared-kernel/index.js';
import {
  PASSWORD_HASHER,
  type PasswordHasher,
  REFRESH_TOKEN_REPOSITORY,
  type RefreshTokenRepository,
  SECRET_GENERATOR,
  type SecretGenerator,
  USER_REPOSITORY,
  type UserRepository,
  WriteAccessPolicy,
} from '../domain/index.js';
import { findUser } from './find-user.js';

/**
 * The superadmin gives a user a temporary password (to hand over in person or by chat). It
 * is how an owner gets their first password, and how a forgotten one is recovered. The
 * user's sessions end, and the temporary password must be changed on first use.
 */
@Injectable()
export class ResetPassword {
  private readonly policy = new WriteAccessPolicy();

  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(REFRESH_TOKEN_REPOSITORY) private readonly refreshTokens: RefreshTokenRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(SECRET_GENERATOR) private readonly secrets: SecretGenerator,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(actor: Actor, userId: string): Promise<{ temporaryPassword: string }> {
    this.policy.assertCanAdminister(actor);
    if (actor.userId === userId) {
      throw new ValidationError(
        'CANNOT_RESET_OWN_PASSWORD',
        'The superadmin changes their own password instead',
      );
    }
    const user = await findUser(this.users, userId);
    const temporaryPassword = this.secrets.temporaryPassword();
    user.resetPassword(await this.hasher.hash(temporaryPassword));

    await this.unitOfWork.run(async () => {
      await this.users.save(user);
      await this.refreshTokens.revokeAllOf(user.id, this.clock.now());
    });
    return { temporaryPassword };
  }
}
