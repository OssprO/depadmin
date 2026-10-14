import { NotFoundError } from '../../../shared-kernel/index.js';
import type { User, UserRepository } from '../domain/index.js';

export async function findUser(users: UserRepository, id: string): Promise<User> {
  const user = await users.findById(id);
  if (!user) throw new NotFoundError('USER_NOT_FOUND', `User ${id} does not exist`);
  return user;
}
