import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';
import {
  EMAIL_TOPICS,
  type EmailTopic,
  type UnsubscribeLinks,
  type UnsubscribeSubject,
} from '../domain/index.js';

/** 128 bits of signature: plenty for a link that can only turn emails off. */
const SIGNATURE_BYTES = 16;
const USER_ID = /^[\w-]{1,64}$/;

const isTopic = (topic: string): topic is EmailTopic =>
  (EMAIL_TOPICS as readonly string[]).includes(topic);

/**
 * `<user id>.<topic>.<signature>`, signed with HMAC-SHA256 (ADR-0034). The key is derived
 * from `JWT_SECRET` with HKDF under a label of its own, so production needs no new secret
 * and a signature made for these links means nothing anywhere else.
 */
export class HmacUnsubscribeLinks implements UnsubscribeLinks {
  private readonly key: Buffer;

  constructor(secret: string) {
    this.key = Buffer.from(hkdfSync('sha256', secret, '', 'depadmin/unsubscribe-links/v1', 32));
  }

  issue(subject: UnsubscribeSubject): string {
    return `${subject.userId}.${subject.topic}.${this.sign(subject).toString('base64url')}`;
  }

  read(token: string): { userId: string; topic: EmailTopic } | null {
    const [userId, topic, signature, ...rest] = token.split('.');
    if (rest.length > 0 || !userId || !USER_ID.test(userId) || !signature) return null;
    return topic && isTopic(topic) ? { userId, topic } : null;
  }

  verify(token: string, subject: UnsubscribeSubject): boolean {
    const named = this.read(token);
    if (named?.userId !== subject.userId || named.topic !== subject.topic) return false;
    const given = Buffer.from(token.split('.')[2] ?? '', 'base64url');
    const expected = this.sign(subject);
    return given.length === expected.length && timingSafeEqual(given, expected);
  }

  private sign({ userId, topic, email }: UnsubscribeSubject): Buffer {
    return createHmac('sha256', this.key)
      .update(`${userId}\n${topic}\n${email}`)
      .digest()
      .subarray(0, SIGNATURE_BYTES);
  }
}
