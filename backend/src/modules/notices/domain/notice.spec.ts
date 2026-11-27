import { describe, expect, it } from 'vitest';
import { FakeShiftRoster } from '../../../../test/support/shift-roster.js';
import { withCode } from '../../../../test/support/domain-error.js';
import { type Actor, Instant, LocalDate, UnitNumber } from '../../../shared-kernel/index.js';
import { assertSpeaksForBuilding, Notice, speaksForBuilding } from './notice.js';

const today = LocalDate.parse('2026-11-27');
const now = Instant.ofEpochMillis(Date.parse('2026-11-27T18:00:00Z'));
const admin: Actor = { role: 'SUPERADMIN', userId: 'u-admin' };
const owner = (unit: number): Actor => ({
  role: 'OWNER',
  userId: `u-${unit}`,
  unit: UnitNumber.of(unit),
});
const content = { title: 'Corte de agua', body: 'El jueves de 9 a 14.', expiresOn: null };

describe('Notice', () => {
  it('keeps the text as written, its lines apart, without the spaces around', () => {
    const notice = Notice.publish(
      'n-1',
      { title: '  Junta ', body: ' El sábado a las 10.\r\n\r\n  En el patio. ', expiresOn: null },
      admin,
      today,
      now,
    );

    expect(notice.title).toBe('Junta');
    expect(notice.body).toBe('El sábado a las 10.\n\n  En el patio.');
    expect(notice.lines).toEqual(['El sábado a las 10.', 'En el patio.']);
  });

  it('needs a title and a text within their limits', () => {
    const publish = (changes: Partial<typeof content>) =>
      Notice.publish('n-1', { ...content, ...changes }, admin, today, now);

    expect(() => publish({ title: '  ' })).toThrow(withCode('NOTICE_TITLE_INVALID'));
    expect(() => publish({ title: 'x'.repeat(101) })).toThrow(withCode('NOTICE_TITLE_INVALID'));
    expect(() => publish({ body: '\n' })).toThrow(withCode('NOTICE_BODY_INVALID'));
    expect(() => publish({ body: 'x'.repeat(2001) })).toThrow(withCode('NOTICE_BODY_INVALID'));
    expect(publish({ title: 'x'.repeat(100), body: 'x'.repeat(2000) }).title).toHaveLength(100);
  });

  it('is current until its last day, which cannot have passed', () => {
    const notice = Notice.publish('n-1', { ...content, expiresOn: today }, admin, today, now);

    expect(notice.isCurrentOn(today)).toBe(true);
    expect(notice.isCurrentOn(today.plusDays(1))).toBe(false);
    expect(Notice.publish('n-2', content, admin, today, now).isCurrentOn(today.plusDays(900))).toBe(
      true,
    );
    expect(() =>
      Notice.publish('n-3', { ...content, expiresOn: today.plusDays(-1) }, admin, today, now),
    ).toThrow(withCode('NOTICE_EXPIRY_PAST'));
  });

  it('is withdrawn once, and then is not current', () => {
    const notice = Notice.publish('n-1', content, admin, today, now);
    notice.withdraw('u-admin', now);

    expect(notice.withdrawn).toEqual({ at: now, by: 'u-admin' });
    expect(notice.isCurrentOn(today)).toBe(false);
    expect(() => notice.withdraw('u-admin', now)).toThrow(withCode('NOTICE_WITHDRAWN'));
  });
});

describe('who speaks for the building', () => {
  const holding = async (unit: number) =>
    new FakeShiftRoster({ '2026-11': [unit] }).responsibilityFor();

  it('is the shift administrator and the superadmin', async () => {
    const responsibility = await holding(401);

    expect(speaksForBuilding(owner(401), today, responsibility)).toBe(true);
    expect(speaksForBuilding(admin, today, responsibility)).toBe(true);
    expect(assertSpeaksForBuilding(owner(401), today, responsibility)).toEqual(owner(401));
  });

  it('is not another owner, nor a reader', async () => {
    const responsibility = await holding(401);
    const reader: Actor = { role: 'READER', userId: 'u-r', unit: UnitNumber.of(401) };

    expect(speaksForBuilding(owner(501), today, responsibility)).toBe(false);
    expect(speaksForBuilding(reader, today, responsibility)).toBe(false);
    expect(() => assertSpeaksForBuilding(owner(501), today, responsibility)).toThrow(
      withCode('SHIFT_ADMIN_ONLY'),
    );
    expect(() => assertSpeaksForBuilding(reader, today, responsibility)).toThrow(
      withCode('READ_ONLY'),
    );
  });
});
