import { Inject, Injectable } from '@nestjs/common';
import {
  UNIT_OF_WORK,
  UnauthenticatedError,
  type UnitOfWork,
} from '../../../shared-kernel/index.js';
import {
  PASSWORD_HASHER,
  type PasswordHasher,
  USER_REPOSITORY,
  type UserRepository,
} from '../domain/index.js';
import { type IssuedSession, SessionIssuer } from './session-issuer.js';

export interface SignInCommand {
  readonly username: string;
  readonly password: string;
}

@Injectable()
export class SignIn {
  /** Verified against when there is no real hash, so every failure takes as long. */
  private dummyHash: Promise<string> | undefined;

  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    private readonly sessions: SessionIssuer,
  ) {}

  /**
   * One error for an unknown user, an owner without a password yet and a wrong password, so
   * the response never reveals which usernames exist.
   */
  async execute({ username, password }: SignInCommand): Promise<IssuedSession> {
    const user = await this.users.findByUsername(username);
    const hash =
      user?.passwordHash ?? (await (this.dummyHash ??= this.hasher.hash('no-such-user')));
    const valid = await this.hasher.verify(hash, password);
    if (!user?.canSignIn || !valid) {
      throw new UnauthenticatedError('INVALID_CREDENTIALS', 'Wrong username or password');
    }
    return this.unitOfWork.run(() => this.sessions.start(user));
  }
}
