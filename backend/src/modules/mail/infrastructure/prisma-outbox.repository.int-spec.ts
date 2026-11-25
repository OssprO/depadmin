import { describe, expect, it } from 'vitest';
import { useTestDatabase } from '../../../../test/support/database.js';
import { Instant, type OutgoingEmail } from '../../../shared-kernel/index.js';
import { OutboxMessage } from '../domain/index.js';
import { PrismaOutboxRepository } from './prisma-outbox.repository.js';

const ctx = useTestDatabase();
const repository = () => new PrismaOutboxRepository(ctx.database);
const now = Instant.ofEpochMillis(Date.parse('2026-11-25T18:00:00.000Z'));

const email = (to: string, changes: Partial<OutgoingEmail> = {}): OutgoingEmail => ({
  kind: 'PASSWORD_RECOVERY',
  to,
  subject: 'Recupera tu contraseña',
  paragraphs: ['Toca el botón.', 'Vence en 1 hora.'],
  action: { label: 'Elegir una contraseña nueva', path: '/reset-password#secret' },
  urgent: false,
  sendBy: now.plusSeconds(60 * 60),
  ...changes,
});

async function enqueue(to: string, at: Instant, changes: Partial<OutgoingEmail> = {}) {
  const message = OutboxMessage.enqueue(crypto.randomUUID(), email(to, changes), at);
  await repository().add(message);
  return message;
}

describe('PrismaOutboxRepository', () => {
  it('claims what is due, urgent first and then oldest, and round-trips it', async () => {
    const first = await enqueue('1@e.mx', now.plusSeconds(-30));
    await enqueue('2@e.mx', now.plusSeconds(-20));
    await enqueue('urgente@e.mx', now.plusSeconds(-10), { urgent: true });
    await enqueue('futuro@e.mx', now.plusSeconds(60));

    const claimed = await repository().claimDue(now, 10, now.plusSeconds(300));

    expect(claimed.map((m) => m.content.to)).toEqual(['urgente@e.mx', '1@e.mx', '2@e.mx']);
    expect(claimed[1]?.props).toEqual(first.props);
  });

  it('skips what another courier holds, until its claim runs out', async () => {
    await enqueue('a@e.mx', now);
    await enqueue('b@e.mx', now);

    const [mine, theirs] = await Promise.all([
      repository().claimDue(now, 1, now.plusSeconds(300)),
      repository().claimDue(now, 1, now.plusSeconds(300)),
    ]);
    expect([...mine, ...theirs].map((m) => m.content.to).sort()).toEqual(['a@e.mx', 'b@e.mx']);
    expect(await repository().claimDue(now, 10, now.plusSeconds(300))).toEqual([]);
    expect(
      await repository().claimDue(now.plusSeconds(300), 10, now.plusSeconds(600)),
    ).toHaveLength(2);
  });

  it('stores what became of an email, wiped, and releases it', async () => {
    const message = await enqueue('a@e.mx', now);
    const [claimed] = await repository().claimDue(now, 1, now.plusSeconds(300));
    await repository().save(claimed!.sent(now));

    const row = await ctx.database.client.emailOutbox.findUniqueOrThrow({
      where: { id: message.id },
    });
    expect(row).toMatchObject({
      status: 'SENT',
      paragraphs: [],
      actionPath: null,
      claimedUntil: null,
      recipient: 'a@e.mx',
    });
    expect(await repository().countSentSince(now.plusSeconds(-1))).toBe(1);
    expect(await repository().countSentSince(now)).toBe(0);
    expect(await repository().countPending()).toBe(0);
  });

  it('expires the late ones, wiping their link, and deletes the old finished ones', async () => {
    await enqueue('tarde@e.mx', now.plusSeconds(-120), { sendBy: now.plusSeconds(-60) });
    await enqueue('a-tiempo@e.mx', now);

    expect(await repository().expireLate(now)).toBe(1);
    const late = await ctx.database.client.emailOutbox.findFirstOrThrow({
      where: { recipient: 'tarde@e.mx' },
    });
    expect(late).toMatchObject({ status: 'EXPIRED', paragraphs: [], actionPath: null });
    expect(await repository().countPending()).toBe(1);

    expect(await repository().deleteFinishedBefore(now)).toBe(0);
    expect(await repository().deleteFinishedBefore(now.plusSeconds(1))).toBe(1);
  });
});
