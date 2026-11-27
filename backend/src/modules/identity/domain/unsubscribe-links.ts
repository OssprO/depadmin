import type { EmailTopic } from './user.js';

/** Whom a link to stop an optional email is for: the account, the topic and the address. */
export interface UnsubscribeSubject {
  readonly userId: string;
  readonly topic: EmailTopic;
  readonly email: string;
}

/**
 * Port: the signed links at the foot of the optional emails (ADR-0034). A link names the
 * account and the topic; its signature also covers the address it went to, so it stops
 * working once the account's address changes. Nothing is stored, and it never expires: the
 * way out of an email must work whenever its reader finds it.
 */
export interface UnsubscribeLinks {
  issue(subject: UnsubscribeSubject): string;
  /** The account and topic a well-formed link names, before checking its signature. */
  read(token: string): { readonly userId: string; readonly topic: EmailTopic } | null;
  /** Whether the link was issued for exactly this subject. */
  verify(token: string, subject: UnsubscribeSubject): boolean;
}

export const UNSUBSCRIBE_LINKS = Symbol('UnsubscribeLinks');
