import {
  type Actor,
  type Role,
  type UnitNumber,
  ValidationError,
} from '../../../shared-kernel/index.js';

const USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/;

/** Usernames are case-insensitive: "Admin" and "admin" are the same user. */
export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export interface UserProps {
  readonly id: string;
  readonly username: string;
  readonly role: Role;
  readonly unit: UnitNumber | null;
  readonly passwordHash: string | null;
  readonly mustChangePassword: boolean;
}

/**
 * Someone who can sign in. There is one owner per depto (its username is the depto number,
 * e.g. "501") and the superadmin, who belongs to no depto.
 *
 * An owner starts without a password and cannot sign in until the superadmin resets it,
 * which hands out a temporary password that must be changed on first use. The password
 * itself never reaches the domain: only its hash (see `PasswordHasher`).
 */
export class User {
  private constructor(
    readonly id: string,
    readonly username: string,
    readonly role: Role,
    readonly unit: UnitNumber | null,
    private hash: string | null,
    private mustChange: boolean,
  ) {}

  static createOwner(id: string, unit: UnitNumber): User {
    return User.restore({
      id,
      username: String(unit.value),
      role: 'OWNER',
      unit,
      passwordHash: null,
      mustChangePassword: false,
    });
  }

  static createSuperadmin(id: string, username: string, passwordHash: string): User {
    return User.restore({
      id,
      username,
      role: 'SUPERADMIN',
      unit: null,
      passwordHash,
      mustChangePassword: false,
    });
  }

  static restore(props: UserProps): User {
    const username = normalizeUsername(props.username);
    if (!USERNAME_PATTERN.test(username)) {
      throw new ValidationError('USERNAME_INVALID', `Invalid username "${props.username}"`);
    }
    if ((props.role === 'OWNER') !== (props.unit !== null)) {
      throw new ValidationError('USER_UNIT_INVALID', 'An owner has a depto; the superadmin none');
    }
    if (props.mustChangePassword && props.passwordHash === null) {
      throw new ValidationError('USER_PASSWORD_INVALID', 'No password to change');
    }
    return new User(
      props.id,
      username,
      props.role,
      props.unit,
      props.passwordHash,
      props.mustChangePassword,
    );
  }

  get passwordHash(): string | null {
    return this.hash;
  }

  /** Set after a reset: the temporary password works once the user replaces it. */
  get mustChangePassword(): boolean {
    return this.mustChange;
  }

  get canSignIn(): boolean {
    return this.hash !== null;
  }

  get actor(): Actor {
    // restore() guarantees that only owners have a depto.
    return this.unit === null
      ? { role: 'SUPERADMIN', userId: this.id }
      : { role: 'OWNER', userId: this.id, unit: this.unit };
  }

  changePassword(newHash: string): void {
    this.hash = newHash;
    this.mustChange = false;
  }

  /** The superadmin hands out a temporary password the owner must replace. */
  resetPassword(temporaryHash: string): void {
    this.hash = temporaryHash;
    this.mustChange = true;
  }
}
