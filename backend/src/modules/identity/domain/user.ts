import {
  type Actor,
  ConflictError,
  type LocalDate,
  type Role,
  type UnitNumber,
  ValidationError,
} from '../../../shared-kernel/index.js';

const USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/;

/** Something, an @, a domain with a dot: the confirmation link proves the rest. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const EMAIL_MAX_LENGTH = 254;

/** Usernames are case-insensitive: "Admin" and "admin" are the same user. */
export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

/** Addresses are stored and compared lowercase: nobody's provider tells the cases apart. */
export function normalizeEmail(address: string): string {
  const email = address.trim().toLowerCase();
  if (email.length > EMAIL_MAX_LENGTH || !EMAIL_PATTERN.test(email)) {
    throw new ValidationError('EMAIL_INVALID', `Invalid email "${address}"`);
  }
  return email;
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
  /** The confirmed email, the only one the app writes to. */
  readonly email: string | null;
  /** Captured and waiting for its confirmation; the confirmed one keeps working meanwhile. */
  readonly pendingEmail: string | null;
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
 *
 * Anyone may have an email (ADR-0033). A new address waits as `pendingEmail` until its owner
 * confirms it, and only then replaces the confirmed one, so a typo never leaves the account
 * without a way to recover it.
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
    private confirmedEmail: string | null,
    private awaitingEmail: string | null,
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
      email: null,
      pendingEmail: null,
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
      email: null,
      pendingEmail: null,
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
      email: null,
      pendingEmail: null,
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
      props.email && normalizeEmail(props.email),
      props.pendingEmail && normalizeEmail(props.pendingEmail),
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

  get email(): string | null {
    return this.confirmedEmail;
  }

  get pendingEmail(): string | null {
    return this.awaitingEmail;
  }

  /**
   * An address to confirm, captured by the user or by the superadmin; returns it normalized.
   * Asking again for the one already waiting is fine: the use case sends a new link.
   */
  requestEmail(address: string): string {
    const email = normalizeEmail(address);
    if (email === this.confirmedEmail) {
      throw new ConflictError('EMAIL_ALREADY_CONFIRMED', `${email} is already confirmed`);
    }
    this.awaitingEmail = email;
    return email;
  }

  /**
   * Its owner followed the link sent to `email`: it becomes the confirmed address. Returns the
   * one it replaces, which is told of the change. A link for an address captured before the
   * one now waiting no longer counts.
   */
  confirmEmail(email: string): string | null {
    if (email !== this.awaitingEmail) {
      throw new ConflictError('EMAIL_LINK_INVALID', `${email} is not waiting for confirmation`);
    }
    const previous = this.confirmedEmail;
    this.confirmedEmail = email;
    this.awaitingEmail = null;
    return previous;
  }

  /** No email at all: the confirmed one and the one waiting. */
  removeEmail(): void {
    if (!this.confirmedEmail && !this.awaitingEmail) {
      throw new ConflictError('EMAIL_NONE', `${this.username} has no email`);
    }
    this.confirmedEmail = null;
    this.awaitingEmail = null;
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
