import { describe, expect, it } from 'vitest';
import { useTestDatabase } from '../../../../test/support/database.js';
import { type Actor, Instant, LocalDate, UnitNumber } from '../../../shared-kernel/index.js';
import { Notice } from '../domain/index.js';
import { PrismaNoticeRepository } from './prisma-notice.repository.js';

const ctx = useTestDatabase();
const repository = () => new PrismaNoticeRepository(ctx.database);
const today = LocalDate.parse('2026-12-01');
const now = Instant.ofEpochMillis(Date.parse('2026-12-01T18:00:00.000Z'));

type Owner = Extract<Actor, { role: 'OWNER' }> & { readonly id: string };

/** The owner's account, written straight: identity is another module. */
async function givenOwner(unit: number): Promise<Owner> {
  const id = crypto.randomUUID();
  await ctx.database.client.user.create({
    data: { id, username: String(unit), role: 'OWNER', unitNumber: unit },
  });
  return { role: 'OWNER', userId: id, id, unit: UnitNumber.of(unit) };
}

const published = ({ id, unit }: Owner, title: string, at = now) =>
  Notice.publish(
    crypto.randomUUID(),
    { title, body: 'El jueves de 9 a 14.\nLlenen sus tinacos.', expiresOn: today.plusDays(2) },
    { role: 'OWNER', userId: id, unit },
    today,
    at,
  );

describe('PrismaNoticeRepository', () => {
  it('round-trips a notice, and its withdrawal', async () => {
    const author = await givenOwner(401);
    const notice = published(author, 'Corte de agua');
    await repository().add(notice);

    expect(await repository().findById(notice.id)).toEqual(notice);
    notice.withdraw(author.id, now.plusSeconds(60));
    await repository().save(notice);
    expect(await repository().findById(notice.id)).toEqual(notice);
    expect(await repository().findById(crypto.randomUUID())).toBeNull();
  });

  it('lists the notices standing, newest first', async () => {
    const author = await givenOwner(401);
    const [older, newer, gone] = [
      published(author, 'Junta', now),
      published(author, 'Corte de agua', now.plusSeconds(60)),
      published(author, 'Retirado', now.plusSeconds(120)),
    ];
    for (const notice of [older, newer, gone]) await repository().add(notice);
    gone.withdraw(author.id, now);
    await repository().save(gone);

    expect((await repository().listPublished()).map((notice) => notice.title)).toEqual([
      'Corte de agua',
      'Junta',
    ]);
  });

  it('keeps who read what, once, and only notices standing', async () => {
    const [author, reader] = [await givenOwner(401), await givenOwner(502)];
    const [read, gone] = [published(author, 'Junta'), published(author, 'Retirado')];
    for (const notice of [read, gone]) await repository().add(notice);
    gone.withdraw(author.id, now);
    await repository().save(gone);

    await repository().markRead(reader.id, [read.id, gone.id, crypto.randomUUID()], now);
    await repository().markRead(reader.id, [read.id], now.plusSeconds(60));

    expect(await repository().readBy(reader.id)).toEqual(new Set([read.id]));
    expect(await repository().readBy(author.id)).toEqual(new Set());
    const rows = await ctx.database.client.noticeRead.findMany();
    expect(rows).toEqual([
      { noticeId: read.id, userId: reader.id, readAt: new Date(now.epochMillis) },
    ]);
  });

  it('refuses in the database what the domain never writes', async () => {
    const author = await givenOwner(401);
    const row = {
      id: crypto.randomUUID(),
      title: 'Junta',
      body: 'El sábado.',
      authorId: author.id,
      authorRole: 'OWNER' as const,
      authorUnit: 401,
      publishedAt: new Date(now.epochMillis),
    };
    const insert = (changes: Partial<typeof row>) =>
      ctx.database.client.notice.create({ data: { ...row, ...changes, id: crypto.randomUUID() } });

    await expect(insert({ title: ' Junta' })).rejects.toThrow(/notice_title_length/);
    await expect(insert({ body: 'x'.repeat(2001) })).rejects.toThrow(/notice_body_length/);
    await expect(insert({ authorRole: 'READER' as never })).rejects.toThrow(/notice_author/);
    await expect(insert({ authorUnit: null as never })).rejects.toThrow(/notice_author/);
  });
});
