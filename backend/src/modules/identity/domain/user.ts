import {
  type Actor,
  ConflictError,
  type LocalDate,
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
  /** The last day it can sign in (a temporary user); null for no end. */
  readonly expiresOn: LocalDate | null;
  /** Deactivated by the superadmin: it cannot sign in until reactivated. */
  readonly disabled: boolean;
}

/** What the superadmin decides about someone's access. */
export interface UserAccess {
  /** A read-only user's depto (a tenant or a relative); none for an accountant. */
  readonly unit: UnitNumber | null;
  readonly expiresOn: LocalDate | null;
}

/**
 * Someone who can sign in. There is one owner per depto (its username is the depto number,
 * e.g. "501"), the superadmin, who belongs to no depto, and any number of read-only users
 * (a tenant or a relative of a depto, or an accountant tied to none).
 *
 * An owner starts without a password and cannot sign in until the superadmin resets it,
 * which hands out a temporary password that must be changed on first use; a read-only user
 * is created with one. Anyone but the superadmin can be given an expiry date (a temporary
 * user) and be deactivated. The password itself never reaches the domain: only its hash
 * (see `PasswordHasher`).
 */
export class User {
  private constructor(
    readonly id: string,
    readonly username: string,
    readonly role: Role,
    private hash: string | null,
    private mustChange: boolean,
    private access: UserAccess,
    private off: boolean,
  ) {}

  static createOwner(id: string, unit: UnitNumber): User {
    return User.restore({
      id,
      username: String(unit.value),
      role: 'OWNER',
      unit,
      passwordHash: null,
      mustChangePassword: false,
      expiresOn: null,
      disabled: false,
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
      expiresOn: null,
      disabled: false,
    });
  }

  /**
   * A read-only user, with the temporary password the superadmin hands over. Its username
   * cannot be a depto number, which belongs to the depto's owner.
   */
  static createReader(
    id: string,
    username: string,
    access: UserAccess,
    temporaryHash: string,
  ): User {
    if (/^\d+$/.test(normalizeUsername(username))) {
      throw new ValidationError('USERNAME_RESERVED', "A number alone is a depto owner's username");
    }
    return User.restore({
      id,
      username,
      role: 'READER',
      unit: access.unit,
      passwordHash: temporaryHash,
      mustChangePassword: true,
      expiresOn: access.expiresOn,
      disabled: false,
    });
  }

  static restore(props: UserProps): User {
    const username = normalizeUsername(props.username);
    if (!USERNAME_PATTERN.test(username)) {
      throw new ValidationError('USERNAME_INVALID', `Invalid username "${props.username}"`);
    }
    if (props.role === 'OWNER' && props.unit === null) {
      throw new ValidationError('USER_UNIT_INVALID', 'An owner has a depto');
    }
    if (props.role === 'SUPERADMIN' && (props.unit !== null || props.expiresOn || props.disabled)) {
      throw new ValidationError(
        'USER_UNIT_INVALID',
        'The superadmin has no depto, no expiry and cannot be deactivated',
      );
    }
    if (props.mustChangePassword && props.passwordHash === null) {
      throw new ValidationError('USER_PASSWORD_INVALID', 'No password to change');
    }
    return new User(
      props.id,
      username,
      props.role,
      props.passwordHash,
      props.mustChangePassword,
      { unit: props.unit, expiresOn: props.expiresOn },
      props.disabled,
    );
  }

  get unit(): UnitNumber | null {
    return this.access.unit;
  }

  get expiresOn(): LocalDate | null {
    return this.access.expiresOn;
  }

  get disabled(): boolean {
    return this.off;
  }

  /** Past its last day: a temporary user whose access ended. */
  hasExpiredOn(today: LocalDate): boolean {
    return this.access.expiresOn !== null && today.isAfter(this.access.expiresOn);
  }

  /** Whether it can sign in on `today`: a password, not deactivated and not expired. */
  canSignInOn(today: LocalDate): boolean {
    return this.canSignIn && !this.off && !this.hasExpiredOn(today);
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
    if (this.role === 'SUPERADMIN') return { role: 'SUPERADMIN', userId: this.id };
    if (this.role === 'READER') return { role: 'READER', userId: this.id, unit: this.unit };
    // restore() guarantees that an owner has a depto.
    return { role: 'OWNER', userId: this.id, unit: this.unit as UnitNumber };
  }

  /**
   * The superadmin changes a user's depto (read-only users only: an owner's depto is its
   * own) and expiry. The superadmin's own access never ends.
   */
  changeAccess(access: UserAccess): void {
    this.assertNotSuperadmin();
    const owner = this.role === 'OWNER';
    if (owner && !(access.unit && this.unit && access.unit.equals(this.unit))) {
      throw new ValidationError('USER_UNIT_INVALID', 'An owner stays with its depto');
    }
    this.access = access;
  }

  /** Deactivated: it cannot sign in, and its sessions end (the use case revokes them). */
  disable(): void {
    this.assertNotSuperadmin();
    if (this.off)
      throw new ConflictError('USER_ALREADY_DISABLED', `${this.username} is already off`);
    this.off = true;
  }

  enable(): void {
    if (!this.off) throw new ConflictError('USER_NOT_DISABLED', `${this.username} is not off`);
    this.off = false;
  }

  private assertNotSuperadmin(): void {
    if (this.role === 'SUPERADMIN') {
      throw new ValidationError('SUPERADMIN_ACCESS_FIXED', "The superadmin's access is fixed");
    }
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
