import { describe, expect, it } from 'vitest';
import { Instant, type OutgoingEmail } from '../../../shared-kernel/index.js';
import { MAX_ATTEMPTS, OutboxMessage, retryWaitMinutes } from './outbox-message.js';

const now = Instant.ofEpochMillis(Date.parse('2026-11-25T18:00:00Z'));
const email: OutgoingEmail = {
  kind: 'PASSWORD_RECOVERY',
  to: 'vecina@ejemplo.mx',
  subject: 'Recupera tu contraseña',
  paragraphs: ['Toca el botón.'],
  action: { label: 'Elegir una contraseña nueva', path: '/reset-password#secret' },
  urgent: true,
  sendBy: now.plusDays(1),
};

describe('OutboxMessage', () => {
  it('is due as soon as it is enqueued', () => {
    const message = OutboxMessage.enqueue('m-1', email, now);

    expect(message.status).toBe('PENDING');
    expect(message.props.nextAttemptAt).toEqual(now);
    expect(message.content).toEqual({
      to: 'vecina@ejemplo.mx',
      subject: 'Recupera tu contraseña',
      paragraphs: ['Toca el botón.'],
      action: email.action,
    });
  });

  it('keeps no words or link once it goes out', () => {
    const sent = OutboxMessage.enqueue('m-1', email, now).sent(now);

    expect(sent.props).toMatchObject({
      status: 'SENT',
      sentAt: now,
      finishedAt: now,
      paragraphs: [],
      action: null,
      recipient: 'vecina@ejemplo.mx',
    });
  });

  it('waits longer after each failure, up to 6 hours', () => {
    expect([1, 2, 3, 4, 10, 20].map(retryWaitMinutes)).toEqual([1, 2, 4, 8, 360, 360]);

    const once = OutboxMessage.enqueue('m-1', email, now).failed('timeout', false, now);
    expect(once.props).toMatchObject({ status: 'PENDING', attempts: 1, lastError: 'timeout' });
    expect(once.props.nextAttemptAt).toEqual(now.plusSeconds(60));
    const twice = once.failed('timeout', false, now);
    expect(twice.props.nextAttemptAt).toEqual(now.plusSeconds(120));
  });

  it('gives up on a permanent failure, or after the last attempt', () => {
    const refused = OutboxMessage.enqueue('m-1', email, now).failed('EENVELOPE', true, now);
    expect(refused.props).toMatchObject({ status: 'FAILED', attempts: 1, paragraphs: [] });

    let message = OutboxMessage.enqueue('m-2', { ...email, sendBy: now.plusDays(30) }, now);
    for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt++) {
      message = message.failed('timeout', false, now);
    }
    expect(message.status).toBe('PENDING');
    expect(message.failed('timeout', false, now).status).toBe('FAILED');
  });

  it('expires instead of retrying after its link would expire', () => {
    const short = OutboxMessage.enqueue('m-1', { ...email, sendBy: now.plusSeconds(90) }, now);

    expect(short.failed('timeout', false, now).status).toBe('PENDING');
    expect(short.failed('timeout', false, now.plusSeconds(30)).status).toBe('EXPIRED');
    expect(short.isLateAt(now.plusSeconds(89))).toBe(false);
    expect(short.isLateAt(now.plusSeconds(90))).toBe(true);
    expect(short.expired(now).props).toMatchObject({ status: 'EXPIRED', action: null });
  });

  it('keeps a short reason for the failure', () => {
    const message = OutboxMessage.enqueue('m-1', email, now).failed('x'.repeat(900), false, now);
    expect(message.props.lastError).toHaveLength(500);
  });
});
