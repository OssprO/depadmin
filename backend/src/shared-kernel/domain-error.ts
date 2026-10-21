/**
 * How a domain error should be reported to the caller. The HTTP layer maps each kind to a
 * status code (validation → 422, conflict → 409, unauthenticated → 401, forbidden → 403,
 * not_found → 404).
 */
export type DomainErrorKind =
  'validation' | 'conflict' | 'unauthenticated' | 'forbidden' | 'not_found';

/**
 * Base class for every business-rule failure. `code` is a stable, machine-readable identifier
 * (the frontend translates it to Spanish); `message` is for developers and logs.
 */
export abstract class DomainError extends Error {
  abstract readonly kind: DomainErrorKind;

  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** Input that can never be valid, whatever the state of the system. */
export class ValidationError extends DomainError {
  readonly kind = 'validation';
}

/** A valid request that clashes with the current state (e.g. editing a closed month). */
export class ConflictError extends DomainError {
  readonly kind = 'conflict';
}

/** The caller could not be identified: bad credentials or a missing, expired or revoked session. */
export class UnauthenticatedError extends DomainError {
  readonly kind = 'unauthenticated';
}

/** The actor is identified but not allowed to do this. */
export class ForbiddenError extends DomainError {
  readonly kind = 'forbidden';
}

export class NotFoundError extends DomainError {
  readonly kind = 'not_found';
}
