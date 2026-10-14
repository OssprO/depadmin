import type { User } from './user.js';

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  /** Case-insensitive: the username is normalized first. */
  findByUsername(username: string): Promise<User | null>;
  /** The superadmin first, then the deptos in order. */
  findAll(): Promise<User[]>;
  save(user: User): Promise<void>;
}

export const USER_REPOSITORY = Symbol('UserRepository');
