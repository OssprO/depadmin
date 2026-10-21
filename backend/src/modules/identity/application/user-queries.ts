import { Inject, Injectable } from '@nestjs/common';
import { type Actor, WriteAccessPolicy } from '../../../shared-kernel/index.js';
import { USER_REPOSITORY, type User, type UserRepository } from '../domain/index.js';
import { findUser } from './find-user.js';

@Injectable()
export class GetCurrentUser {
  constructor(@Inject(USER_REPOSITORY) private readonly users: UserRepository) {}

  execute(actor: Actor): Promise<User> {
    return findUser(this.users, actor.userId);
  }
}

/** Every account, for the superadmin's user management screen. */
@Injectable()
export class ListUsers {
  private readonly policy = new WriteAccessPolicy();

  constructor(@Inject(USER_REPOSITORY) private readonly users: UserRepository) {}

  execute(actor: Actor): Promise<User[]> {
    this.policy.assertCanAdminister(actor);
    return this.users.findAll();
  }
}
