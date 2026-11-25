import type { Instant } from './instant.js';

/** A button in an email: its text and where it leads inside the app (`/reset-password#…`). */
export interface EmailAction {
  readonly label: string;
  /** A path of the app; the mail module puts the app's address in front of it. */
  readonly path: string;
}

/**
 * An email as a use case writes it: the words only. The mail module lays it out (HTML and
 * plain text) when it sends it.
 */
export interface OutgoingEmail {
  /** What it is, as a stable code (e.g. `PASSWORD_RECOVERY`), for the log. */
  readonly kind: string;
  readonly to: string;
  readonly subject: string;
  readonly paragraphs: readonly string[];
  readonly action: EmailAction | null;
  /** Goes before the rest when the daily limit is near (a password recovery). */
  readonly urgent: boolean;
  /** After this it is useless (its link expired), so it is dropped instead of sent. */
  readonly sendBy: Instant;
}

/**
 * Port: the outbox (ADR-0033). A use case enqueues an email inside its unit of work, so the
 * email exists only if what caused it was saved; the mail module sends it after the commit
 * and retries it if the provider fails.
 */
export interface Outbox {
  enqueue(email: OutgoingEmail): Promise<void>;
  /** Whether emails go out now. Without a provider they wait in the outbox until `sendBy`. */
  readonly delivers: boolean;
}

export const OUTBOX = Symbol('Outbox');
